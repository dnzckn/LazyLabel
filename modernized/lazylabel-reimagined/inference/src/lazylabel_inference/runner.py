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

from .propagation import (
    FrameResult,
    PropagationRequest,
    StagedSequence,
    initialise_state,
    propagate,
    seed_mask,
    stage_sequence,
)
from .prompts import InvalidPromptError
from .windows import Window, effective, novel_frames, plan


@dataclass(frozen=True)
class ReferenceObject:
    """One object the user has already drawn, on one frame, as the run's seed.

    The mask is the user's OWN annotation rather than something re-derived from a prompt: legacy
    seeds propagation with `add_new_mask`, and re-clicking an object someone already drew gives a
    mask close to theirs and not theirs.
    """

    #: Position in `PropagationRequest.sequence`, never a file name (RULE-017).
    frame: int
    object_id: int
    #: A decoded 2-D array. Decoding happens at the route, so this layer never parses wire formats.
    mask: Any


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

    External references — those outside the window — are prepended, deduplicated BY FRAME because
    one frame can carry several objects and staging it twice would give SAM 2 two copies of the
    same picture.
    """
    inside = range(window.start, window.end + 1)
    external: list[int] = []
    for reference in references:
        if reference.frame not in inside and reference.frame not in external:
            external.append(reference.frame)
    external.sort()

    positions = [*external, *inside]
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
) -> Iterator[FrameResult]:
    """Carry the reference masks through the sequence, yielding each object on each frame.

    A generator, like `propagate` and for the same reason: the frames already yielded are the
    frames already done, so the job registry's cancel keeps committed work (RULE-063).

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

    try:
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
            ):
                yield result

            if cancel is not None and cancel.is_set():
                return
    finally:
        if staging_root is None:
            shutil.rmtree(root, ignore_errors=True)


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
) -> Iterator[FrameResult]:
    plan_for = _build_window(window, references)

    # READ FAILURES ARE SKIPPED, not fatal. `stage_sequence` already guards the WRITE of each
    # frame and keeps going, and a read has to behave the same way or one corrupt image ends a job
    # that was about to do 599 other frames correctly. The frame is simply absent from the staging,
    # so `StagedSequence`'s map has one fewer entry and every remaining entry still names its own
    # image -- which is the difference RULE-017 is about. If NONE can be read, `stage_sequence`
    # says so.
    images = []
    unreadable: list[tuple[str, str]] = []
    for position in plan_for.positions:
        key = sequence[position]
        try:
            images.append((key, reader(key)))
        except Exception as cause:  # noqa: BLE001 - any read failure means the same thing here
            unreadable.append((key, str(cause)))

    staged = stage_sequence(images, directory)
    # Carried on the staged sequence rather than dropped, so a caller can report "3 frames could
    # not be read" instead of quietly returning a shorter result.
    staged.skipped.extend(unreadable)
    _resolve_staged(plan_for, staged, sequence)

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

    first = plan_for.staged_index.get(window.start)
    # Bounded by what was actually STAGED, not by the window's nominal size. A frame that could not
    # be read leaves the staging shorter, and asking SAM 2 to track more frames than exist is how a
    # skipped image turns into a result attributed past the end of the sequence.
    available = len(staged.frames) - (first or 0)
    for result in propagate(
        predictor,
        state,
        staged,
        start_frame=first,
        # The WINDOW's length rather than the novel count: the overlap frames are propagated again
        # -- that is what gives the next window its run-up -- and their results are discarded below
        # rather than never produced.
        max_frames=max(0, min(window.size, available)),
    ):
        position = _position_of(result.source, sequence)
        # RULE-026: a frame covered by an earlier window keeps the EARLIER window's result, which
        # was produced with temporal memory behind it rather than from a standing start.
        if position is None or position not in novel:
            continue
        yield result
        if cancel is not None and cancel.is_set():
            return


def _position_of(source: str, sequence: list[str]) -> int | None:
    try:
        return sequence.index(source)
    except ValueError:
        return None
