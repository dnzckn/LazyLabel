"""RULE-026's windows, checked against legacy's own loop rather than against my reading of it.

Every other differential in this suite needs a checkpoint and skips without one. This one needs
nothing: which frames a window covers is arithmetic over integers, and legacy's `_propagate_chunked`
touches only `self.state.chunk_config`, `self.state.total_frames` and `self._cancel_requested`. So
the real function is lifted out of the legacy source with `ast`, executed with a stand-in `self`
whose `_process_chunk` records the boundaries it is handed, and compared against the port over a
few hundred generated cases.

THE POINT OF DOING IT THIS WAY is that a transcription cannot check itself. Writing legacy's loop
out again in the test and asserting the two agree proves only that I typed the same thing twice;
this runs legacy's actual bytes. And because it needs no model, it runs on every commit, which is
where an off-by-one in a window boundary would otherwise sit undetected until someone had a GPU.
"""

from __future__ import annotations

import ast
import pathlib
from types import SimpleNamespace

import pytest

from lazylabel_inference.windows import (
    DEFAULT_OVERLAP,
    DEFAULT_WINDOW,
    estimate_megabytes,
    novel_frames,
    plan,
    should_stream,
)

LEGACY = (
    pathlib.Path(__file__).resolve().parents[4]
    / "legacy"
    / "lazylabel"
    / "src"
    / "lazylabel"
    / "ui"
    / "managers"
    / "propagation_manager.py"
)


def _legacy_chunker():
    """Legacy's `_propagate_chunked`, lifted out of the file and made callable on its own.

    By AST rather than by importing the module: the import pulls the whole `lazylabel.ui` package
    in, and the function itself depends on none of it.
    """
    tree = ast.parse(LEGACY.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "_propagate_chunked":
            module = ast.Module(body=[node], type_ignores=[])
            ast.fix_missing_locations(module)
            namespace: dict = {}
            exec(compile(module, str(LEGACY), "exec"), namespace)  # noqa: S102 - legacy's own source
            return namespace["_propagate_chunked"]
    raise AssertionError(f"_propagate_chunked is not in {LEGACY}")


def legacy_windows(
    start: int, end: int, *, window: int, overlap: int, reverse: bool
) -> list[tuple[int, int]]:
    """The (start, end) pairs legacy's loop would process, in order."""
    recorded: list[tuple[int, int]] = []

    def process_chunk(chunk_start, chunk_end, **_kwargs):
        recorded.append((chunk_start, chunk_end))
        return iter(())

    stand_in = SimpleNamespace(
        state=SimpleNamespace(
            chunk_config=SimpleNamespace(chunk_size=window, overlap=overlap),
            total_frames=max(start, end) + 1,
        ),
        _cancel_requested=False,
        _process_chunk=process_chunk,
    )

    list(_legacy_chunker()(stand_in, start, end, reverse, False, None))
    return recorded


def ported(start: int, end: int, *, window: int, overlap: int, reverse: bool):
    return [(w.start, w.end) for w in plan(start, end, window=window, overlap=overlap, reverse=reverse)]


@pytest.mark.skipif(not LEGACY.is_file(), reason="the legacy worktree is not checked out")
class TestAgainstLegacy:
    def test_the_rule_card_s_worked_example(self):
        # 600 frames, window 250: 0-249, 245-494, 490-599. The one case BUSINESS_RULES.md states
        # outright, so if the extraction were pointed at the wrong function this would catch it.
        assert ported(0, 599, window=250, overlap=5, reverse=False) == [
            (0, 249),
            (245, 494),
            (490, 599),
        ]
        assert legacy_windows(0, 599, window=250, overlap=5, reverse=False) == ported(
            0, 599, window=250, overlap=5, reverse=False
        )

    @pytest.mark.parametrize("reverse", [False, True])
    @pytest.mark.parametrize("window", [1, 2, 7, 50, 250, 1000])
    @pytest.mark.parametrize("span", [0, 1, 2, 6, 13, 249, 250, 251, 600])
    def test_every_boundary_agrees(self, reverse: bool, window: int, span: int):
        overlap = min(DEFAULT_OVERLAP, window - 1)
        start, end = (span, 0) if reverse else (0, span)

        assert ported(start, end, window=window, overlap=overlap, reverse=reverse) == legacy_windows(
            start, end, window=window, overlap=overlap, reverse=reverse
        )

    def test_a_range_not_starting_at_zero_agrees(self):
        # The reference is rarely frame 0, and an implementation that quietly assumed it would pass
        # every case above.
        for start, end in [(40, 40), (40, 41), (40, 600), (137, 900)]:
            assert ported(start, end, window=250, overlap=5, reverse=False) == legacy_windows(
                start, end, window=250, overlap=5, reverse=False
            )


class TestTheWindowsThemselves:
    def test_a_sequence_shorter_than_the_window_is_one_pass(self):
        assert [(w.start, w.end) for w in plan(0, 99, window=250)] == [(0, 99)]

    def test_each_window_backs_up_by_the_overlap(self):
        # Not decoration: SAM 2 carries temporal memory, and a window starting cold has none.
        windows = plan(0, 599, window=250, overlap=5)

        for earlier, later in zip(windows, windows[1:]):
            assert later.start == earlier.end + 1 - 5

    def test_windows_are_numbered_from_one_for_the_progress_message(self):
        assert [w.number for w in plan(0, 599, window=250)] == [1, 2, 3]

    def test_backward_windows_walk_right_to_left(self):
        windows = plan(599, 0, window=250, overlap=5, reverse=True)

        assert windows[0].start > windows[-1].start
        assert windows[0].end == 599
        assert windows[-1].start == 0

    def test_an_equal_start_and_end_covers_nothing(self):
        # Legacy's `range_size <= 0: return`, kept deliberately. Propagating "frame 40 to frame 40"
        # does nothing rather than doing frame 40, and Phase 6 compares against that.
        assert plan(40, 40, window=250) == []

    def test_the_last_window_is_truncated_not_extended(self):
        windows = plan(0, 599, window=250, overlap=5)

        assert windows[-1].end == 599
        assert windows[-1].size == 110

    def test_a_window_bigger_than_the_overlap_is_required(self):
        # Legacy has no such guard, and without one each window begins at or before the previous
        # one -- a loop that never ends, on a job the user is already waiting on.
        with pytest.raises(ValueError, match="does not fit inside"):
            plan(0, 100, window=5, overlap=5)

    def test_a_window_must_hold_a_frame(self):
        with pytest.raises(ValueError, match="at least one frame"):
            plan(0, 100, window=0)


class TestWhetherToStreamAtAll:
    def test_more_frames_than_the_window_streams(self):
        assert should_stream(251, DEFAULT_WINDOW) is True

    def test_exactly_a_window_does_not(self):
        # STRICTLY greater. The one value where "more than a window" is ambiguous in English.
        assert should_stream(250, DEFAULT_WINDOW) is False

    def test_the_user_can_turn_it_off(self):
        assert should_stream(10_000, DEFAULT_WINDOW, streaming=False) is False

    def test_the_estimate_is_what_makes_turning_it_off_a_choice(self):
        # Legacy warns with frames x 12.6 MB. Without it, turning streaming off on a long sequence
        # does not fail tidily -- it exhausts memory part-way through a job already under way.
        assert estimate_megabytes(1000) == pytest.approx(12_600)


class TestWhatEachWindowContributes:
    def test_overlap_frames_belong_to_the_earlier_window(self):
        # RULE-026: the overlap frames keep the EARLIER window's results -- the ones produced with
        # temporal memory behind them rather than from a standing start.
        novel = novel_frames(plan(0, 599, window=250, overlap=5))

        assert novel[0][:1] == [0]
        assert len(novel[0]) == 250
        assert novel[1][0] == 250
        assert len(novel[1]) == 245

    def test_together_they_cover_the_range_exactly_once(self):
        # What a progress bar counts. Summing the windows' own spans reports more frames than the
        # sequence has, which is how a bar reaches 103%.
        flattened = [frame for window in novel_frames(plan(0, 599, window=250, overlap=5)) for frame in window]

        assert flattened == list(range(600))
