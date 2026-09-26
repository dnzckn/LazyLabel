"""What actually runs inside a propagation job.

The job API knows how to start, watch and stop work. `propagation.py` knows how to stage frames,
seed a reference and pull SAM 2 through a sequence. `windows.py` knows which frames each pass
covers. This is the part that joins them, and it is almost entirely INDEX ARITHMETIC — which is
precisely where RULE-017 says legacy loses work.

THE PREPENDED REFERENCES ARE THE WHOLE TRICK, and they are legacy's design rather than an
invention here (`propagation_manager.py:959-1060`). A window covering frames 245-494 cannot seed
from a reference on frame 0, because frame 0 is not in the window — and a mask pinned to whichever
image happens to sit at local index 0 is a mask pinned to an unrelated picture. So every window is
built as `external references + the window's own frames`, the references deduplicated by image,
and the seeds land on real image-and-mask pairs.

That makes three different numbering systems live at once:

  - the SEQUENCE position, which is what the caller asked about;
  - the WINDOW's own range, in sequence positions;
  - the STAGED index, which counts the prepended references first and is what SAM 2 sees.

Legacy converts between them with arithmetic at every use (`(ann.frame_idx - chunk_start) +
n_prepended`), and RULE-017 is the record of what that costs when a frame is skipped. Here the
conversion happens once, when a window is built, and every result is resolved back through
`StagedSequence`'s map — so a frame that could not be staged removes an entry rather than shifting
every entry after it.

TWO MODES, AS LEGACY HAS. A sequence no longer than the window -- or any sequence with streaming off
-- runs in ONE state: every frame staged, forward from the earliest reference, then backward from
the same reference in the same state (`_run_whole`, legacy's full-context mode). Only a longer
sequence is windowed. The difference is not an optimisation. SAM 2 tracks each frame from the
memory of the frames it tracked just before, and walking backward those are the frames AFTER it --
which, in the state the forward pass has just filled, are frames the forward pass tracked. Until
2026-09-23 this ran the backward pass in a fresh state of its own and walked it FORWARD from the far
end, and the synthetic-shapes golden caught it on its first run: the square's mask on frame 0
shared no pixel with legacy's (IoU 0.00), and four frames were flagged that legacy did not flag.
A backward WINDOW is walked in reverse too, from the reference, which is staged after its frames.

NOTHING HERE IMPORTS TORCH DIRECTLY. The predictor arrives from the service and the staging is
`propagation.py`'s, so the arithmetic below is testable with a fake that yields whatever a test
needs — which is the only way to test the case that matters, a sequence long enough to window.
"""

from __future__ import annotations

import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterator

from .jobs import Skipped
from .propagation import (
    FrameResult,
    ReferenceObject,
    PropagationRequest,
    SourceImage,
    StagedSequence,
    initialise_state,
    propagate,
    seed_mask,
    stage_sequence,
)
from .prompts import InvalidPromptError
from .windows import Window, effective, novel_frames, plan, should_stream


@dataclass
class _WindowPlan:
    """One window, with the staging that makes its references real images."""

    window: Window
    #: Sequence positions to stage, prepended references first.
    positions: list[int]
    #: Sequence position -> staged index, for the frames this window stages.
    staged_index: dict[int, int]


def _windows_for(request: PropagationRequest) -> list[Window]:
    """Both passes, forward then backward, as RULE-025 orders them.

    Always both, and always away from the EARLIEST reference: legacy runs forward from the lowest
    reference to the range end and then backward from the same reference to the range start. It
    ignores the user's start on the near side of that reference, which its own rule card calls a
    defect; this reproduces it, because Phase 6 compares against it.
    """
    window, overlap = effective(
        len(request.sequence), request.window, streaming=request.streaming
    )
    lowest = request.lowest_reference
    last = len(request.sequence) - 1

    forward = plan(
        lowest,
        request.end if request.end is not None else last,
        window=window,
        overlap=overlap,
    )
    backward = plan(
        lowest,
        request.start if request.start is not None else 0,
        window=window,
        overlap=overlap,
        reverse=True,
    )
    return [*forward, *backward]


def _build_window(window: Window, references: list[ReferenceObject]) -> _WindowPlan:
    """Which frames this window stages, and where each one lands.

    External references — those outside the window — are deduplicated BY FRAME, because one frame
    can carry several objects and staging it twice would give SAM 2 two copies of the same picture.

    They go on the side the walk STARTS from: before a forward window's frames and after a backward
    window's. A backward walk begins at the reference and moves down, so the reference has to sit
    just above the window's highest frame. Legacy prepends in both directions and walks with no
    start frame (`propagation_manager.py:1016, 1062`), which SAM 2 takes to be the earliest seeded
    one: staged index 0, where it skips reverse tracking outright. MEASURED on the streaming golden
    (SEQUENCE_PARITY.md SP-09): legacy's second backward window staged [12, 0-7], walked, and
    answered nothing, and frames 0-2 stayed pending and unwritten. This window answers them; the
    difference is kept, and `test_propagation_streaming_golden.py` holds both sides of it.
    """
    inside = range(window.start, window.end + 1)
    external: list[int] = []
    for reference in references:
        if reference.frame not in inside and reference.frame not in external:
            external.append(reference.frame)
    external.sort()

    positions = [*inside, *external] if window.reverse else [*external, *inside]
    return _WindowPlan(
        window=window,
        positions=positions,
        # Built from the list rather than by arithmetic, so a caller never has to know how many
        # references were prepended. That subtraction is where legacy's version goes wrong.
        staged_index={},
    )


def _resolve_staged(plan_for: _WindowPlan, staged: StagedSequence, sequence: list[str]) -> None:
    """Fill in sequence position -> staged index, using what was ACTUALLY staged.

    Not `positions.index(...)`: a frame that could not be read is skipped, and every index after it
    would then be wrong by one. The staged sequence is the only authority on where a frame landed.
    """
    remaining = list(plan_for.positions)
    for frame in staged.frames:
        # Frames are staged in the order given, so the first remaining position naming this image
        # is the one that produced it.
        for index, position in enumerate(remaining):
            if sequence[position] == frame.source:
                plan_for.staged_index[position] = frame.index
                del remaining[:index + 1]
                break


def run_propagation(
    predictor: Any,
    read_image: Callable[[str], Any],
    request: PropagationRequest,
    references: list[ReferenceObject],
    cancel: Any = None,
    *,
    staging_root: Path | None = None,
) -> Iterator[FrameResult | Skipped]:
    """Carry the reference masks through the sequence, yielding each object on each frame.

    A generator, like `propagate` and for the same reason: the frames already yielded are the
    frames already done, so the job registry's cancel keeps committed work (RULE-063).

    It also yields `Skipped`, once for each frame it leaves out -- unreadable, or another size than
    the reference's (RULE-071) -- before any frame is propagated, as legacy marks them Skipped and
    says so before it propagates (`main_window.py:4149-4162`).

    The cancel is checked BETWEEN WINDOWS as well as inside one. A window is up to 250 frames of
    GPU work, and a Cancel that only took effect at the end of the current window would appear not
    to have worked at all.

    The predictor and the reader are passed IN rather than reached for through a service. This
    module is index arithmetic, and index arithmetic is worth testing with a fake; taking a service
    would mean every test of the numbering had to build one, which is how a layer of arithmetic
    ends up exercised only by the one test that owns a GPU.
    """
    if not references:
        raise InvalidPromptError("a propagation needs at least one reference object to carry")

    sequence = list(request.sequence)
    for reference in references:
        if not 0 <= reference.frame < len(sequence):
            raise InvalidPromptError(
                f"reference frame {reference.frame} is outside a sequence of {len(sequence)}"
            )

    root = Path(tempfile.mkdtemp(prefix="lazylabel-propagation-")) if staging_root is None else staging_root
    root.mkdir(parents=True, exist_ok=True)

    # RULE-071's "reference size": the size of the first reference frame, which every other frame
    # is measured against. Read once, before any window, because a size that changed between
    # windows would silently change which frames are in the run.
    reference_size: tuple[int, int] | None = None
    try:
        first = read_image(sequence[references[0].frame])
    except (OSError, ValueError, KeyError):
        # An unreadable reference fails again below, with a message about the seed rather than
        # about sizing. NARROW on purpose: a broad `except Exception` here swallowed a NameError in
        # this very block -- the reader was called by the wrong name -- and the only symptom was
        # that every frame passed the size check, because there was no reference size to fail it.
        first = None
    if isinstance(first, SourceImage):
        # Its pixels. A `SourceImage` has no shape of its own: read off it, the shape is None, there
        # is no reference size, and every frame of every size passes RULE-071's check.
        first = first.pixels
    shape = getattr(first, "shape", None)
    if shape is not None and len(shape) >= 2:
        reference_size = (int(shape[0]), int(shape[1]))

    # The frames reported left out, each once, and not read again by a later window.
    left_out: set[str] = set()
    try:
        if not should_stream(len(sequence), request.window, streaming=request.streaming):
            yield from _run_whole(
                predictor=predictor,
                request=request,
                references=references,
                sequence=sequence,
                reader=read_image,
                directory=root / "whole",
                cancel=cancel,
                reference_size=reference_size,
                left_out=left_out,
            )
            return

        # Every frame measured before the first window, as legacy measures every frame before it
        # propagates (`propagation_manager.py:218-256`): what the run leaves out is known, and said,
        # at the start rather than a window at a time.
        if reference_size is not None:
            found: list[tuple[str, str]] = []
            for key in sequence:
                if cancel is not None and cancel.is_set():
                    return
                _array, reason = _measured(read_image, key, reference_size)
                if reason is not None:
                    found.append((key, reason))
            yield from _report(found, reference_size, left_out)

        windows = _windows_for(request)
        novel_per_window = novel_frames(windows)

        for number, (window, novel) in enumerate(zip(windows, novel_per_window), start=1):
            if cancel is not None and cancel.is_set():
                return
            if not novel:
                # Entirely overlap: every frame was covered by an earlier window, whose results are
                # the ones RULE-026 keeps. Staging it would be GPU work with nothing to show.
                continue

            for result in _run_window(
                predictor=predictor,
                request=request,
                references=references,
                window=window,
                novel=set(novel),
                sequence=sequence,
                reader=read_image,
                directory=root / f"window-{number:03d}",
                cancel=cancel,
                reference_size=reference_size,
                left_out=left_out,
            ):
                yield result

            if cancel is not None and cancel.is_set():
                return
    finally:
        if staging_root is None:
            shutil.rmtree(root, ignore_errors=True)


def _measured(
    reader: Callable[[str], Any], key: str, reference_size: tuple[int, int] | None
) -> tuple[SourceImage | None, str | None]:
    """One frame read, or why it must be left out: it cannot be read, or it is another size.

    The reader gives an RGB array, or a `SourceImage` that also carries a JPEG's own bytes for the
    staging (SEQUENCE_PARITY.md SP-08); either comes back as a `SourceImage`.

    READ FAILURES ARE SKIPPED, not fatal. `stage_sequence` already guards the WRITE of each frame
    and keeps going, and a read has to behave the same way or one corrupt image ends a job that was
    about to do 599 other frames correctly.

    RULE-071: a frame whose size differs from the REFERENCE size is left out too. Not a nicety.
    SAM 2's video state is built from one stack of frames, so a differently sized one is either
    rejected deep inside the loader -- ending a 600-frame run over one bad image -- or silently
    resized, which moves every mask it produces. Legacy skips them and says so on the timeline, and
    skipping is the only one of those three that is honest.
    """
    try:
        read = reader(key)
    except Exception as cause:  # noqa: BLE001 - any read failure means the same thing here
        return None, str(cause)

    source = read if isinstance(read, SourceImage) else SourceImage(pixels=read)
    shape = getattr(source.pixels, "shape", None)
    size = None if shape is None else (int(shape[0]), int(shape[1]))
    if reference_size is not None and size is not None and size != reference_size:
        return None, (
            f"its size {size[1]}x{size[0]} is not the reference's "
            f"{reference_size[1]}x{reference_size[0]}"
        )
    return source, None


def _report(
    found: list[tuple[str, str]],
    reference_size: tuple[int, int] | None,
    reported: set[str],
) -> Iterator[Skipped]:
    """The frames in `found` not reported before, as one `Skipped`, or nothing."""
    new: list[tuple[str, str]] = []
    for key, reason in found:
        if key not in reported:
            reported.add(key)
            new.append((key, reason))
    if new:
        yield Skipped(frames=tuple(new), reference_size=reference_size)


def _stage(
    *,
    plan_for: _WindowPlan,
    sequence: list[str],
    reader: Callable[[str], Any],
    directory: Path,
    reference_size: tuple[int, int] | None,
    left_out: set[str],
) -> StagedSequence:
    """Read and stage `plan_for.positions`, leaving out every frame that cannot take part.

    A frame left out is simply absent from the staging, so `StagedSequence`'s map has one fewer
    entry and every remaining entry still names its own image -- which is the difference RULE-017
    is about. If NONE can be staged, `stage_sequence` says so. `left_out` names frames already
    measured and reported, which are not read again.
    """
    images = []
    unusable: list[tuple[str, str]] = []
    for position in plan_for.positions:
        key = sequence[position]
        if key in left_out:
            continue
        source, reason = _measured(reader, key, reference_size)
        if reason is not None:
            unusable.append((key, reason))
            continue
        images.append((key, source))

    staged = stage_sequence(images, directory)
    # Carried on the staged sequence rather than dropped, so the run can report them instead of
    # quietly returning a shorter result.
    staged.skipped.extend(unusable)
    _resolve_staged(plan_for, staged, sequence)
    return staged


def _seed(
    *,
    predictor: Any,
    plan_for: _WindowPlan,
    staged: StagedSequence,
    references: list[ReferenceObject],
) -> Any:
    """Open a SAM 2 state on what was staged, and seed every reference staged."""
    state = initialise_state(predictor, staged)

    for reference in references:
        local = plan_for.staged_index.get(reference.frame)
        if local is None:
            # The frame could not be staged. Skipped rather than fatal, and the seed is simply not
            # placed -- which is visible as that object not being carried, rather than as a mask
            # attached to whichever picture happens to sit at that index.
            continue
        seed_mask(
            predictor,
            state,
            staged,
            frame_index=local,
            object_id=reference.object_id,
            mask=reference.mask,
        )
    return state


def _run_whole(
    *,
    predictor: Any,
    request: PropagationRequest,
    references: list[ReferenceObject],
    sequence: list[str],
    reader: Callable[[str], Any],
    directory: Path,
    cancel: Any,
    reference_size: tuple[int, int] | None,
    left_out: set[str],
) -> Iterator[FrameResult | Skipped]:
    """Legacy's full-context mode: every frame in ONE state, forward from the earliest reference, then back.

    `propagation_manager.py:623-685` loads every frame, walks forward from the earliest reference
    to the range end, and then walks BACKWARD from the same reference to the range start in the
    same state -- so the backward walk has the forward walk's frames in its memory. Both passes
    here do the same, which is what makes them match legacy frame for frame.

    EVERY frame is staged, not only the range, because legacy stages every frame -- and because it
    shows: SAM 2 computes one frame past the end of a pass before the loop sees it and stops, and
    that frame's memory is in the state when the other pass runs. Staging only the range would make
    a range ending near the reference differ from legacy for that reason alone.

    Each pass stops at its range end the way legacy's `_propagate_range` does, by breaking on the
    first frame beyond it; a pass whose range is empty does not run (`range_size <= 0: return`). The
    reference frame opens both walks and is reported once.
    """
    if cancel is not None and cancel.is_set():
        # Before any staging: a cancel that arrived first costs nothing at all.
        return
    plan_for = _WindowPlan(
        window=Window(0, len(sequence) - 1, 1),
        positions=list(range(len(sequence))),
        staged_index={},
    )
    staged = _stage(
        plan_for=plan_for,
        sequence=sequence,
        reader=reader,
        directory=directory,
        reference_size=reference_size,
        left_out=left_out,
    )
    # Said before the model loads the frames, as legacy says it before it propagates.
    yield from _report(staged.skipped, reference_size, left_out)
    state = _seed(predictor=predictor, plan_for=plan_for, staged=staged, references=references)

    lowest = request.lowest_reference
    last = len(sequence) - 1
    end = request.end if request.end is not None else last
    start = request.start if request.start is not None else 0
    passes: list[tuple[bool, Callable[[int], bool]]] = []
    if end - lowest > 0:
        passes.append((False, lambda position: position > end))
    if lowest - start > 0:
        passes.append((True, lambda position: position < start))

    # Where both walks begin. None when the earliest reference could not be staged, and SAM 2 then
    # starts from the earliest frame it WAS seeded on, which is the nearest thing to the request.
    first = plan_for.staged_index.get(lowest)
    reported: set[int] = set()
    in_flight: str | None = None
    for number, (reverse, beyond) in enumerate(passes):
        if number > 0 and cancel is not None and cancel.is_set():
            # Between the passes, as between windows: the backward walk is the other half of the
            # GPU work, and a Cancel that waited for it would look like a button that did nothing.
            return
        this_pass: set[int] = set()
        for result in propagate(predictor, state, staged, start_frame=first, reverse=reverse):
            position = _position_of(result.source, sequence)
            if position is None:
                continue
            if beyond(position):
                break
            if position in reported:
                continue
            if cancel is not None and cancel.is_set():
                # The frame in flight finishes WHOLE, every object on it (RULE-063).
                if in_flight is None:
                    in_flight = result.source
                if result.source != in_flight:
                    return
            this_pass.add(position)
            yield result
        reported |= this_pass


def _run_window(
    *,
    predictor: Any,
    request: PropagationRequest,
    references: list[ReferenceObject],
    window: Window,
    novel: set[int],
    sequence: list[str],
    reader: Callable[[str], Any],
    directory: Path,
    cancel: Any,
    reference_size: tuple[int, int] | None,
    left_out: set[str],
) -> Iterator[FrameResult | Skipped]:
    plan_for = _build_window(window, references)
    staged = _stage(
        plan_for=plan_for,
        sequence=sequence,
        reader=reader,
        directory=directory,
        reference_size=reference_size,
        left_out=left_out,
    )
    # Whatever the measuring before the first window could not know: a frame that failed to read
    # or write only now, or every size when the reference's could not be read.
    yield from _report(staged.skipped, reference_size, left_out)
    state = _seed(predictor=predictor, plan_for=plan_for, staged=staged, references=references)

    if window.reverse:
        # A backward walk begins AT the reference and moves down through the window, which is why
        # `_build_window` staged the reference just above the window's frames. SAM 2 bounds a
        # reverse walk at staged index 0 itself.
        first = plan_for.staged_index.get(request.lowest_reference)
        span = None if first is None else first + 1
    else:
        first = plan_for.staged_index.get(window.start)
        # Bounded by what was actually STAGED, not by the window's nominal size. A frame that could
        # not be read leaves the staging shorter, and asking SAM 2 to track more frames than exist
        # is how a skipped image turns into a result attributed past the end of the sequence.
        available = len(staged.frames) - (first or 0)
        # The WINDOW's length rather than the novel count: the overlap frames are propagated again
        # -- that is what gives the next window its run-up -- and their results are discarded below
        # rather than never produced.
        span = max(0, min(window.size, available))
    in_flight: str | None = None
    for result in propagate(
        predictor,
        state,
        staged,
        start_frame=first,
        max_frames=span,
        reverse=window.reverse,
    ):
        position = _position_of(result.source, sequence)
        # RULE-026: a frame covered by an earlier window keeps the EARLIER window's result, which
        # was produced with temporal memory behind it rather than from a standing start.
        if position is None or position not in novel:
            continue
        if cancel is not None and cancel.is_set():
            # The frame in flight finishes WHOLE, every object on it (RULE-063). This returned
            # after any object until 2026-09-23, so a cancel between two objects of one frame kept
            # half of that frame.
            if in_flight is None:
                in_flight = result.source
            if result.source != in_flight:
                return
        yield result


def _position_of(source: str, sequence: list[str]) -> int | None:
    try:
        return sequence.index(source)
    except ValueError:
        return None
