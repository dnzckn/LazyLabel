"""The parts of the golden-capture script that do not need a GPU or the legacy app.

The capture itself drives legacy's sequence mode on a real checkpoint, so it cannot run in CI. What
can is everything that decides WHAT it captures: the argument parsing, the frame order, the four
scenarios, and the reduction of legacy's raw model output to one result per object per frame.
Those are where a mistake is silent -- a mis-parsed reference seeds the wrong frame, and a wrong
reduction produces a golden that disagrees with legacy for a reason nobody would look for.
"""

from __future__ import annotations

import importlib.util
import pathlib
import sys

import numpy as np
import pytest

MODULE = pathlib.Path(__file__).parent / "fixtures" / "capture_propagation_goldens.py"

spec = importlib.util.spec_from_file_location("capture_propagation_goldens", MODULE)
assert spec is not None and spec.loader is not None
capture = importlib.util.module_from_spec(spec)
# Registered before it runs: `@dataclass` looks its module up in `sys.modules` to resolve the
# annotations `from __future__ import annotations` left as strings.
sys.modules[spec.name] = capture
spec.loader.exec_module(capture)


class TestReferenceParsing:
    def test_reads_frame_class_and_mask(self) -> None:
        reference = capture.parse_reference("8:1:disc.png")

        assert (reference.frame, reference.class_id, reference.path) == (8, 1, pathlib.Path("disc.png"))

    def test_a_windows_path_keeps_its_drive(self) -> None:
        # Split twice from the left, so the colon after the drive letter belongs to the path.
        reference = capture.parse_reference("8:2:C:/clips/square.png")

        assert reference.path == pathlib.Path("C:/clips/square.png")

    @pytest.mark.parametrize("text", ["", "8", "8:1", "8:1:", "x:1:a.png", "8:y:a.png"])
    def test_refuses_what_is_not_a_reference(self, text: str) -> None:
        # Refused with the input echoed, rather than seeding somewhere arbitrary: a mask on the
        # wrong frame produces a plausible-looking golden that is simply of the wrong sequence.
        with pytest.raises(SystemExit) as raised:
            capture.parse_reference(text)
        assert "--reference must look like" in str(raised.value)


class TestLabelledFrames:
    def test_reads_a_list_sorted_and_without_repeats(self) -> None:
        assert capture.parse_frames("21,5,15,5") == (5, 15, 21)

    def test_empty_means_none(self) -> None:
        assert capture.parse_frames("") == ()

    def test_refuses_what_is_not_a_number(self) -> None:
        with pytest.raises(SystemExit, match="--labeled"):
            capture.parse_frames("5,x")


class TestScenarios:
    def test_legacy_s_defaults_come_first(self) -> None:
        # Keep Flagged off and Skip Labeled ON: the checkbox defaults (sequence_widget.py:334-348),
        # which are not the engine's function defaults -- those are both False.
        first = capture.scenarios_for((5,))[0]

        assert (first.name, first.keep_flagged, first.skip_labeled, first.labeled) == (
            "defaults", False, True, ()
        )

    def test_each_checkbox_is_turned_against_its_default_once(self) -> None:
        scenarios = {s.name: s for s in capture.scenarios_for((5, 15))}

        assert scenarios["keep-flagged"].keep_flagged is True
        assert scenarios["skip-labeled"].labeled == (5, 15)
        assert scenarios["overwrite"].skip_labeled is False
        assert scenarios["overwrite"].labeled == (5, 15)


class TestFrameOrder:
    def test_sorts_by_name_as_legacy_does(self, tmp_path: pathlib.Path) -> None:
        for name in ["frame_10.png", "frame_2.png", "frame_1.png"]:
            (tmp_path / name).write_bytes(b"")

        # NOT numerically. A sequence numbered without zero padding propagates in an order nobody
        # intended, and that is the dataset's problem -- but a golden that quietly reordered the
        # frames would hide the very thing a user would report.
        assert [p.name for p in capture.frames_in(tmp_path)] == [
            "frame_1.png",
            "frame_10.png",
            "frame_2.png",
        ]

    def test_ignores_files_that_are_not_images(self, tmp_path: pathlib.Path) -> None:
        (tmp_path / "a.png").write_bytes(b"")
        (tmp_path / "a.npz").write_bytes(b"")
        (tmp_path / "notes.txt").write_bytes(b"")

        assert [p.name for p in capture.frames_in(tmp_path)] == ["a.png"]

    def test_refuses_a_folder_with_no_images(self, tmp_path: pathlib.Path) -> None:
        with pytest.raises(SystemExit, match="no images"):
            capture.frames_in(tmp_path)


def raw(frame: int, obj: int, confidence: float, pixels: int = 4, reverse: bool = False) -> dict:
    mask = np.zeros((3, 5), dtype=bool)
    mask.flat[:pixels] = True
    return {"frame": frame, "object": obj, "confidence": confidence, "reverse": reverse, "mask": mask}


class TestTheModelsResults:
    def test_reference_frames_are_left_out(self) -> None:
        # Legacy's engine skips them, and their mask is the user's own drawing, not an answer.
        results, masks = capture.model_results([raw(8, 1, 1.0), raw(9, 1, 0.999)], {8}, 0.99)

        assert [r["frame"] for r in results] == [9]
        assert list(masks) == ["9:1"]

    def test_flagging_is_strictly_below_the_threshold(self) -> None:
        results, _ = capture.model_results([raw(1, 1, 0.99), raw(2, 1, 0.9899)], set(), 0.99)

        assert [r["flagged"] for r in results] == [False, True]

    def test_an_empty_mask_is_not_flagged_whatever_it_scores(self) -> None:
        # RULE-060: an object that left the picture scores 0.0, and is dropped, not flagged.
        results, _ = capture.model_results([raw(3, 2, 0.0, pixels=0)], set(), 0.99)

        assert results[0]["empty"] is True
        assert results[0]["flagged"] is False

    def test_the_pass_is_recorded(self) -> None:
        results, _ = capture.model_results([raw(2, 1, 1.0, reverse=True), raw(9, 1, 1.0)], {8}, 0.99)

        assert [r["pass"] for r in results] == ["backward", "forward"]

    def test_an_object_answered_twice_is_refused(self) -> None:
        with pytest.raises(SystemExit, match="came back twice"):
            capture.model_results([raw(3, 1, 1.0), raw(3, 1, 1.0)], set(), 0.99)


class TestOneAnswerAcrossScenarios:
    def test_identical_runs_agree(self) -> None:
        run = [raw(1, 1, 0.999), raw(2, 1, 0.97)]

        assert capture.same_answers(run, [dict(entry) for entry in run]) is None

    def test_a_different_mask_is_named(self) -> None:
        assert "different mask" in capture.same_answers([raw(1, 1, 1.0, pixels=4)], [raw(1, 1, 1.0, pixels=5)])

    def test_a_different_score_is_named(self) -> None:
        assert "scored" in capture.same_answers([raw(1, 1, 0.999)], [raw(1, 1, 0.998)])


class TestMaskPacking:
    def test_the_note_round_trips(self) -> None:
        """The unpacking recipe written into the golden's metadata actually works.

        Worth a test because it is instructions rather than code: nothing executes it, so an error
        in it survives until someone tries to read a golden months later.
        """
        height, width = 7, 11  # deliberately not a multiple of 8, where packbits pads
        original = np.zeros((height, width), dtype=bool)
        original[2, 3] = True
        original[6, 10] = True

        restored = np.unpackbits(capture.pack(original))[: height * width].reshape(height, width).astype(bool)

        assert np.array_equal(restored, original)
