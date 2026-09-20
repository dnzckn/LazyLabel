"""Staging, confidence, and the two ways legacy loses propagated work.

None of this needs a model. The staging map and the confidence guard are the parts that decide
whether a propagated mask lands on the right image with the right score, and both are testable with
a fake predictor -- which is also the only way to test the failure paths at all, since a real one
does not crash on demand.
"""

from __future__ import annotations

import pathlib

import numpy as np
import pytest

from lazylabel_inference.propagation import (
    PropagationError,
    StagedFrame,
    StagedSequence,
    confidence_of,
    initialise_state,
    propagate,
    seed_points,
    stage_sequence,
)
from lazylabel_inference.prompts import InvalidPromptError, ModelNotLoadedError


def image(value: int = 128, size: tuple[int, int] = (8, 10)) -> np.ndarray:
    return np.full((size[0], size[1], 3), value, dtype=np.uint8)


class TestStaging:
    def test_writes_one_jpeg_per_frame_under_a_dense_index(self, tmp_path: pathlib.Path) -> None:
        staged = stage_sequence([(f"frames/f{i}.png", image(i * 10)) for i in range(4)], tmp_path)

        assert [frame.index for frame in staged.frames] == [0, 1, 2, 3]
        assert sorted(p.name for p in tmp_path.glob("*.jpg")) == [
            "00000.jpg",
            "00001.jpg",
            "00002.jpg",
            "00003.jpg",
        ]

    def test_every_frame_knows_which_image_it_is(self, tmp_path: pathlib.Path) -> None:
        keys = ["a.png", "b.png", "c.png"]
        staged = stage_sequence([(k, image()) for k in keys], tmp_path)

        assert [staged.source_of(i) for i in range(3)] == keys

    def test_a_skipped_frame_shifts_nothing(self, tmp_path: pathlib.Path) -> None:
        """RULE-017, and the whole reason the map exists.

        Legacy names each staged frame after its position in the app's list and skips an unreadable
        one without renumbering, so SAM 2 -- which sorts by the number and then indexes by position
        -- attributes every later mask to the image before it. Here the indices stay dense, so a
        gap in the SOURCE list is not a gap in the staged list, and nothing shifts.
        """
        # The middle image is unwritable: a 0-dimension array cv2 will refuse.
        images = [
            ("a.png", image()),
            ("broken.png", np.zeros((0, 0, 3), dtype=np.uint8)),
            ("c.png", image()),
        ]
        staged = stage_sequence(images, tmp_path)

        assert [frame.index for frame in staged.frames] == [0, 1]
        # Frame 1 is c.png, not b.png. Legacy would have staged it as 00002 and called it frame 1.
        assert staged.source_of(1) == "c.png"
        assert [key for key, _ in staged.skipped] == ["broken.png"]

    def test_reports_what_it_skipped_rather_than_dropping_it(self, tmp_path: pathlib.Path) -> None:
        staged = stage_sequence(
            [("a.png", image()), ("broken.png", np.zeros((0, 0, 3), dtype=np.uint8))], tmp_path
        )

        # A sequence that silently shrinks is a sequence the user thinks was fully propagated.
        assert len(staged.skipped) == 1
        assert staged.skipped[0][0] == "broken.png"
        assert staged.skipped[0][1]

    def test_refuses_a_sequence_with_no_usable_frame(self, tmp_path: pathlib.Path) -> None:
        with pytest.raises(InvalidPromptError, match="no frame"):
            stage_sequence([("broken.png", np.zeros((0, 0, 3), dtype=np.uint8))], tmp_path)

    def test_refuses_an_index_outside_the_staged_set(self, tmp_path: pathlib.Path) -> None:
        staged = stage_sequence([("a.png", image())], tmp_path)

        # Better a loud failure than an index silently wrapping onto the wrong image.
        with pytest.raises(PropagationError, match="outside"):
            staged.source_of(7)
        with pytest.raises(PropagationError):
            staged.source_of(-1)


class TestConfidence:
    def test_is_the_sigmoid_of_the_mean_positive_logit(self) -> None:
        torch = pytest.importorskip("torch")
        logits = torch.tensor([-5.0, -1.0, 2.0, 4.0])

        expected = float(torch.sigmoid(torch.tensor([2.0, 4.0]).mean()).item())
        assert confidence_of(logits) == pytest.approx(expected)

    def test_is_zero_when_the_object_has_no_positive_pixels(self) -> None:
        torch = pytest.importorskip("torch")

        # mean over an empty selection is NaN, and NaN compares false against every threshold -- so
        # an object that vanished would never be flagged for review. 0.0 flags it immediately.
        assert confidence_of(torch.tensor([-5.0, -1.0, -0.001])) == 0.0

    def test_never_returns_nan(self) -> None:
        import math

        torch = pytest.importorskip("torch")
        for logits in [torch.tensor([-1.0]), torch.tensor([0.0]), torch.tensor([1e6])]:
            assert not math.isnan(confidence_of(logits))

    def test_a_confident_object_scores_near_one(self) -> None:
        torch = pytest.importorskip("torch")
        assert confidence_of(torch.tensor([20.0, 20.0])) > 0.99


class FakePredictor:
    """A video predictor that yields what it is told to, and can fail on cue."""

    def __init__(self, frames, fail_after: int | None = None):
        self.frames = frames
        self.fail_after = fail_after

    def propagate_in_video(self, **_kwargs):
        for count, (index, object_ids, logits) in enumerate(self.frames):
            if self.fail_after is not None and count == self.fail_after:
                raise RuntimeError("the GPU fell over")
            yield index, object_ids, logits


@pytest.mark.skipif(pytest.importorskip("torch", reason="needs torch") is None, reason="needs torch")
class TestPropagating:
    def staged(self) -> StagedSequence:
        return StagedSequence(
            directory=pathlib.Path("."),
            frames=[StagedFrame(0, "a.png"), StagedFrame(1, "b.png"), StagedFrame(2, "c.png")],
        )

    def frame(self, index: int, value: float):
        import torch

        return (index, [1], torch.full((1, 4, 4), value))

    def test_attributes_each_mask_to_the_image_the_map_names(self) -> None:
        predictor = FakePredictor([self.frame(0, 3.0), self.frame(1, 3.0), self.frame(2, 3.0)])

        results = list(propagate(predictor, object(), self.staged()))

        assert [r.source for r in results] == ["a.png", "b.png", "c.png"]

    def test_carries_the_confidence_per_object(self) -> None:
        predictor = FakePredictor([self.frame(0, 4.0), self.frame(1, -4.0)])
        results = list(propagate(predictor, object(), self.staged()))

        assert results[0].confidence > 0.9
        assert results[1].confidence == 0.0  # every logit negative: the object vanished

    def test_a_failure_is_raised_with_the_frames_already_done(self) -> None:
        predictor = FakePredictor([self.frame(0, 3.0), self.frame(1, 3.0)], fail_after=1)
        results = []

        with pytest.raises(PropagationError) as raised:
            for result in propagate(predictor, object(), self.staged()):
                results.append(result)

        # Legacy catches everything and returns, so a propagation that dies on frame 40 of 200 ends
        # quietly having yielded 39 -- indistinguishable from a 39-frame sequence.
        assert raised.value.completed == 1
        assert len(results) == 1
        assert "the GPU fell over" in str(raised.value)

    def test_refuses_to_run_without_a_predictor(self) -> None:
        with pytest.raises(ModelNotLoadedError):
            list(propagate(None, None, self.staged()))

    def test_refuses_a_frame_index_the_map_does_not_cover(self) -> None:
        predictor = FakePredictor([self.frame(9, 3.0)])

        # If SAM 2 ever returns an index outside the staged set, that is a bug worth stopping for,
        # not a mask to attribute to whichever image happens to be at that position.
        with pytest.raises(PropagationError, match="outside"):
            list(propagate(predictor, object(), self.staged()))


class FakeSeeder:
    """A video predictor that records how it was called when a prompt is added."""

    def __init__(self, object_ids=(1,), logits=None, raises: Exception | None = None):
        import torch

        self.object_ids = list(object_ids)
        self.logits = torch.full((len(self.object_ids), 1, 4, 4), 3.0) if logits is None else logits
        self.raises = raises
        self.calls: list[dict] = []

    def add_new_points_or_box(self, **kwargs):
        if self.raises is not None:
            raise self.raises
        self.calls.append(kwargs)
        return kwargs["frame_idx"], self.object_ids, self.logits


@pytest.mark.skipif(pytest.importorskip("torch", reason="needs torch") is None, reason="needs torch")
class TestSeeding:
    def staged(self) -> StagedSequence:
        return StagedSequence(
            directory=pathlib.Path("."),
            frames=[StagedFrame(0, "a.png"), StagedFrame(1, "b.png")],
        )

    def seed(self, predictor, **overrides):
        import numpy as np

        arguments = {
            "frame_index": 0,
            "object_id": 1,
            "points": np.array([[2, 2]], dtype=np.float32),
            "labels": np.array([1], dtype=np.int32),
        }
        arguments.update(overrides)
        return seed_points(predictor, object(), self.staged(), **arguments)

    def test_the_seed_names_the_image_rather_than_a_frame_number(self) -> None:
        # The same resolution `propagate` does. A seed result that said "frame 0" would be the one
        # place a caller had to map an index back to an image itself.
        assert self.seed(FakeSeeder()).source == "a.png"

    def test_it_clears_previous_points_as_legacy_does(self) -> None:
        # Without it, a second click on the same frame ADDS to the first rather than replacing it,
        # and the user's correction becomes a refinement of the thing they were correcting.
        predictor = FakeSeeder()
        self.seed(predictor)

        assert predictor.calls[0]["clear_old_points"] is True

    def test_it_picks_the_logits_belonging_to_the_object_asked_for(self) -> None:
        import torch

        logits = torch.stack(
            [torch.full((1, 4, 4), -5.0), torch.full((1, 4, 4), 5.0)]  # object 7 is the second
        )
        predictor = FakeSeeder(object_ids=(3, 7), logits=logits)

        result = self.seed(predictor, object_id=7)

        assert result.mask.sum() == 16  # all positive: the second object's logits, not the first's
        assert result.object_id == 7

    def test_an_empty_selection_scores_zero_not_a_half(self) -> None:
        """Legacy says 0.5 here and 0.0 for the same condition during propagation.

        0.5 is the worse of the two. A click that selected nothing is not a middling result, and a
        user shown 0.5 has been told something false about a mask that does not exist.
        """
        import torch

        predictor = FakeSeeder(logits=torch.full((1, 1, 4, 4), -3.0))

        assert self.seed(predictor).confidence == 0.0

    def test_a_refused_prompt_is_an_error_not_a_none(self) -> None:
        predictor = FakeSeeder(raises=RuntimeError("out of memory"))

        with pytest.raises(PropagationError, match="out of memory"):
            self.seed(predictor)

    def test_refuses_to_seed_without_a_predictor(self) -> None:
        import numpy as np

        with pytest.raises(ModelNotLoadedError):
            seed_points(
                None,
                None,
                self.staged(),
                frame_index=0,
                object_id=1,
                points=np.array([[2, 2]], dtype=np.float32),
                labels=np.array([1], dtype=np.int32),
            )


class TestInitialisingState:
    def test_refuses_without_a_predictor(self) -> None:
        with pytest.raises(ModelNotLoadedError):
            initialise_state(None, StagedSequence(directory=pathlib.Path(".")))

    def test_offloads_video_to_the_cpu_by_default(self) -> None:
        """The flag SAM 2 defaults to False and legacy sets to True, with a reason on both counts.

        A thousand frames of decoded video in VRAM alongside the weights is how a propagation turns
        into an out-of-memory error on a hosted GPU. It also moves the fifth decimal of a
        confidence, so a caller taking the default disagreed with legacy for a reason that had
        nothing to do with propagation -- which is why this is not left to callers at all.
        """
        recorded: dict = {}

        class Recorder:
            device = "cpu"

            def init_state(self, **kwargs):
                recorded.update(kwargs)
                return "state"

        state = initialise_state(Recorder(), StagedSequence(directory=pathlib.Path("staged")))

        assert state == "state"
        assert recorded["offload_video_to_cpu"] is True
        assert recorded["offload_state_to_cpu"] is False
