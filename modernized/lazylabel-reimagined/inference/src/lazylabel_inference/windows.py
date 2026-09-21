"""Chopping a long sequence into windows — RULE-026, and the last unread setting.

A 600-frame sequence does not fit in memory as one SAM 2 video state: legacy's own estimate is
12.6 MB per frame, so 1000 frames is about 12 GB of frame tensors. Streaming is how it copes —
process 250 frames, drop them, process the next 250 — and `stream_window_size` is the number the
user sets. It was the one setting in the schema that nothing in this app read.

WHY THIS IS ITS OWN MODULE, with no model anywhere near it: deciding WHICH frames a window covers
is arithmetic over integers. It needs no checkpoint, no GPU and no sequence on disk, so it can be
proven against legacy exactly — which matters, because every off-by-one here silently changes
which frames get propagated at all.

THE OVERLAP IS NOT DECORATION. SAM 2 carries temporal memory between frames, and a window that
begins cold at frame 250 has none. Five frames of overlap give the next window a run-up, and
RULE-026 keeps the EARLIER window's results for those five — the ones that were produced with
memory behind them rather than from a standing start.

Two details that look like bugs and are legacy's behaviour, kept deliberately because Phase 6's
equivalence criterion compares against it:

1. Streaming turns on when the TIMELINE is longer than the window, not when the RANGE is. A
   600-frame sequence propagated over a 10-frame range still takes the streaming path, where it
   produces exactly one window and the difference is invisible. Comparing range size instead
   would be more sensible and would disagree with legacy on nothing observable, which is a poor
   reason to differ.

2. A zero-length range yields NO windows at all. `range_size = abs(start - end)` is 0 when they
   are equal and legacy returns before the loop, so propagating "from frame 40 to frame 40" does
   nothing rather than doing frame 40.
"""

from __future__ import annotations

from dataclasses import dataclass

#: Frames each window shares with the one before it. `ChunkConfig.overlap`, not a user setting.
DEFAULT_OVERLAP = 5

#: `ChunkConfig.chunk_size`, and the schema's `stream_window_size` default.
DEFAULT_WINDOW = 250

#: What legacy warns with when streaming is turned off on a long sequence. MB per frame.
MEGABYTES_PER_FRAME = 12.6


@dataclass(frozen=True)
class Window:
    """One pass over a contiguous run of frames, inclusive at both ends.

    Inclusive because legacy's indices are, and converting to half-open here would mean converting
    back at every comparison against a golden — which is exactly where an off-by-one hides.
    """

    start: int
    end: int
    #: 1-based, as legacy numbers them for the progress message ("window 2 of 3").
    number: int

    @property
    def size(self) -> int:
        return self.end - self.start + 1

    def frames(self) -> range:
        return range(self.start, self.end + 1)


def should_stream(total_frames: int, window: int, *, streaming: bool = True) -> bool:
    """Whether the streaming path is taken at all.

    STRICTLY greater, so exactly 250 frames with a 250 window runs all at once. The boundary is
    worth stating in a test because it is the one value where "more than a window" is ambiguous in
    English and unambiguous in the code.
    """
    return streaming and total_frames > window


def estimate_megabytes(total_frames: int) -> float:
    """Legacy's memory estimate for holding a whole sequence at once.

    What the warning is FOR: turning streaming off on a long sequence does not fail with a tidy
    error, it exhausts memory part-way through a job the user has been waiting on. A number in
    advance is the difference between a choice and a surprise.
    """
    return total_frames * MEGABYTES_PER_FRAME


def plan(
    start: int,
    end: int,
    *,
    window: int = DEFAULT_WINDOW,
    overlap: int = DEFAULT_OVERLAP,
    reverse: bool = False,
) -> list[Window]:
    """The windows covering `start` to `end`, in the order they will be processed.

    Forward expects `start <= end` and backward expects `start >= end`: the FIRST index is the
    reference end in both directions, because propagation always moves away from the reference.
    """
    if window <= 0:
        raise ValueError(f"a window must hold at least one frame, not {window}")
    if overlap < 0:
        raise ValueError(f"the overlap cannot be negative, not {overlap}")
    if overlap >= window:
        # Otherwise each window would begin at or before the previous one and the walk would never
        # terminate. Legacy has no such guard; it simply never sets one.
        raise ValueError(f"an overlap of {overlap} does not fit inside a window of {window}")

    # Legacy's `range_size <= 0: return`. Equal ends propagate nothing, which is point 2 above.
    if abs(start - end) <= 0:
        return []

    return _backward(start, end, window, overlap) if reverse else _forward(start, end, window, overlap)


def _forward(start: int, end: int, window: int, overlap: int) -> list[Window]:
    windows: list[Window] = []
    cursor = start
    while cursor <= end:
        stop = min(cursor + window - 1, end)
        windows.append(Window(cursor, stop, len(windows) + 1))
        if stop >= end:
            break
        # The next window BACKS UP by the overlap: it starts before the previous one ended.
        cursor = stop + 1 - overlap
    return windows


def _backward(start: int, end: int, window: int, overlap: int) -> list[Window]:
    windows: list[Window] = []
    cursor = start
    while cursor >= end:
        begin = max(cursor - window + 1, end)
        windows.append(Window(begin, cursor, len(windows) + 1))
        if begin <= end:
            break
        cursor = begin - 1 + overlap
    return windows


def novel_frames(windows: list[Window]) -> list[list[int]]:
    """Per window, the frames it is the FIRST to cover.

    RULE-026's overlap rule stated as data. A frame in an overlap is propagated twice and the
    earlier window's result is the one kept, so this is what each window actually contributes --
    and its flattening is the frame list a progress bar should count, since counting every window's
    full span reports more frames than the sequence has.
    """
    seen: set[int] = set()
    novel: list[list[int]] = []
    for each in windows:
        fresh = [frame for frame in each.frames() if frame not in seen]
        seen.update(fresh)
        novel.append(fresh)
    return novel


def effective(
    total_frames: int,
    window: int,
    *,
    streaming: bool = True,
    overlap: int = DEFAULT_OVERLAP,
) -> tuple[int, int]:
    """The window and overlap actually used, given whether streaming applies at all.

    THE CASE THIS EXISTS FOR is the short sequence. With streaming off -- or a sequence no longer
    than the window, which is the same thing -- the whole range is one pass, and an overlap between
    windows that do not exist is meaningless. Carrying the default 5 into that plan refuses any
    sequence of fewer than six frames outright, which is how a three-frame propagation became a
    500 rather than a propagation.

    The clamp on the streaming branch is the same defect one step along: a user is allowed to set a
    window of 50 and nothing stops a caller asking for less, so an overlap that does not fit inside
    the window is reduced until it does rather than refused.
    """
    if not should_stream(total_frames, window, streaming=streaming):
        return max(total_frames, 1), 0
    return window, min(overlap, window - 1)
