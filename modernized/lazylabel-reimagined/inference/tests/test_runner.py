"""The index arithmetic inside a propagation job — RULE-017's defect, with no model in sight.

What this proves is not that SAM 2 tracks well. It is that when a window covering frames 245-494
seeds from a reference on frame 0, the mask lands on frame 0's PICTURE and not on whichever image
happens to sit at local index 0 — and that a frame which could not be read removes an entry rather
than shifting every entry after it.

That is the whole of RULE-017, and it is arithmetic, so every case here runs against a fake
predictor that records what it was handed. A real checkpoint could not test most of it: a model
does not fail to stage a frame on request.

Also names RULE-025 and RULE-071, which this module implements and which are proven below:
RULE-025 is the direction and range -- both passes, always away from the EARLIEST reference -- and
RULE-071 is the skipping of frames whose size differs from the reference's.
"""

from __future__ import annotations

import importlib.util
import pathlib

import numpy as np
import pytest

from lazylabel_inference.propagation import PropagationRequest
from lazylabel_inference.prompts import InvalidPromptError
from lazylabel_inference.runner import ReferenceObject, run_propagation


class FakePredictor:
    """Records every seed and reports which staged frames it was walked over."""

    device = "cpu"

    def __init__(self, *, object_ids=(1,)) -> None:
        self.object_ids = list(object_ids)
        self.seeds: list[dict] = []
        self.states: list[dict] = []
        self.walks: list[dict] = []

    # --- what `initialise_state` calls -------------------------------------------------
    def init_state(self, **kwargs):
        state = {"video_path": kwargs.get("video_path"), "frames": kwargs}
        self.states.append(state)
        return state

    # --- what `seed_mask` calls --------------------------------------------------------
    def add_new_mask(self, **kwargs):
        import torch

        self.seeds.append(kwargs)
        return kwargs["frame_idx"], self.object_ids, torch.full((len(self.object_ids), 1, 2, 2), 3.0)

    # --- what `propagate` calls --------------------------------------------------------
    def propagate_in_video(self, **kwargs):
        import torch

        self.walks.append(kwargs)
        start = kwargs.get("start_frame_idx") or 0
        count = kwargs.get("max_frame_num_to_track") or 1
        for offset in range(count):
            yield start + offset, self.object_ids, torch.full(
                (len(self.object_ids), 1, 2, 2), 3.0
            )


def image(value: int = 128):
    return np.full((4, 4, 3), value, dtype=np.uint8)


def sequence(count: int) -> list[str]:
    return [f"frames/f{index:03d}.png" for index in range(count)]


def request(count: int, **overrides) -> PropagationRequest:
    return PropagationRequest(
        sequence=tuple(sequence(count)),
        references=overrides.pop("references", (0,)),
        **overrides,
    )


def reference(frame: int, object_id: int = 1) -> ReferenceObject:
    mask = np.zeros((4, 4), dtype=np.uint8)
    mask[1:3, 1:3] = 1
    return ReferenceObject(frame=frame, object_id=object_id, mask=mask)


def run(predictor, wanted, references, tmp_path, *, reader=None, cancel=None):
    return list(
        run_propagation(
            predictor,
            reader or (lambda _key: image()),
            wanted,
            references,
            cancel,
            staging_root=tmp_path,
        )
    )


# Staging writes JPEGs with cv2, and the fake predictor returns torch tensors because the code under
# test calls `.cpu()` on them inside torch.autocast. So these need both, and must SKIP without
# either -- which, checking cv2 alone, they did not: installing OpenCV for SEC-02's tests made
# them fail on `import torch` instead.
pytestmark = pytest.mark.skipif(
    importlib.util.find_spec("cv2") is None or importlib.util.find_spec("torch") is None,
    reason="the runner stages frames with cv2, and its fake predictor returns torch tensors",
)


class TestOneWindow:
    def test_every_result_names_an_IMAGE_from_the_sequence(self, tmp_path: pathlib.Path) -> None:
        predictor = FakePredictor()

        results = run(predictor, request(4), [reference(0)], tmp_path)

        assert results
        assert all(result.source in sequence(4) for result in results)

    def test_the_seed_lands_on_the_reference_frame(self, tmp_path: pathlib.Path) -> None:
        # A single window holds the whole sequence, so frame 2 is staged at index 2.
        predictor = FakePredictor()

        run(predictor, request(4), [reference(2)], tmp_path)

        assert [seed["frame_idx"] for seed in predictor.seeds] == [2]

    def test_several_objects_on_one_frame_each_get_a_seed(self, tmp_path: pathlib.Path) -> None:
        predictor = FakePredictor(object_ids=(1, 2))

        run(predictor, request(4), [reference(1, 1), reference(1, 2)], tmp_path)

        assert sorted(seed["obj_id"] for seed in predictor.seeds) == [1, 2]
        # One frame, staged once: two annotations on the same picture must not stage it twice.
        assert {seed["frame_idx"] for seed in predictor.seeds} == {1}


class TestPrependedReferences:
    """The trick that makes a windowed propagation seed from a real image."""

    def big(self, **overrides) -> PropagationRequest:
        # 600 frames with a window of 250: three forward windows, per RULE-026's worked example.
        return request(600, window=250, references=(0,), **overrides)

    def test_a_reference_outside_a_window_is_STAGED_INTO_it(self, tmp_path: pathlib.Path) -> None:
        # The second window covers 245-494 and its reference is frame 0. Without prepending, the
        # seed would land on whatever image sits at local index 0 -- frame 245's picture.
        predictor = FakePredictor()

        run(predictor, self.big(), [reference(0)], tmp_path)

        # One seed per window, and every window got one.
        assert len(predictor.seeds) == len(predictor.states)
        assert len(predictor.states) >= 3

    def test_the_prepended_reference_is_at_staged_index_ZERO(self, tmp_path: pathlib.Path) -> None:
        # Prepended references occupy the front of the staged list, so the seed for an external
        # reference goes to index 0 -- and the image at index 0 IS the reference's image, which is
        # the entire point of prepending it.
        predictor = FakePredictor()

        run(predictor, self.big(), [reference(0)], tmp_path)

        # First window contains frame 0, so the seed is in place at 0. Later windows prepend it,
        # which also puts it at 0. Every seed is therefore at 0 here -- for two different reasons.
        assert {seed["frame_idx"] for seed in predictor.seeds} == {0}

    def test_an_in_window_reference_keeps_its_own_position(self, tmp_path: pathlib.Path) -> None:
        # Legacy keeps references that already fall in the chunk in place rather than duplicating
        # them, and the position then has to account for however many were prepended.
        predictor = FakePredictor()

        run(predictor, request(10, window=250), [reference(3)], tmp_path)

        assert [seed["frame_idx"] for seed in predictor.seeds] == [3]

    def test_two_references_prepend_in_frame_order(self, tmp_path: pathlib.Path) -> None:
        predictor = FakePredictor()

        run(predictor, self.big(), [reference(500), reference(0)], tmp_path)

        first_window_seeds = predictor.seeds[:2]
        # Frame 500 is outside the first window (0-249) and frame 0 is inside it, so 500 is
        # prepended at index 0 and 0 sits at index 1 -- one further along than it would be alone.
        assert sorted(seed["frame_idx"] for seed in first_window_seeds) == [0, 1]


class TestAFrameThatCannotBeRead:
    def test_the_others_still_land_on_the_right_images(self, tmp_path: pathlib.Path) -> None:
        """RULE-017 in one test.

        Legacy stages under names derived from position and skips an unreadable frame without
        renumbering, so every frame after the gap comes back attributed to the image before it.
        Here the staged sequence is the authority on where each frame landed.
        """
        keys = sequence(5)
        predictor = FakePredictor()

        def reader(key: str):
            if key == keys[1]:
                raise OSError("this one is corrupt")
            return image()

        results = run(predictor, request(5), [reference(0)], tmp_path, reader=reader)

        assert results
        # Nothing is attributed to the unreadable frame, and nothing is attributed to a frame it
        # is not -- every source is a real key and none of them is the skipped one.
        assert all(result.source in keys for result in results)
        assert keys[1] not in {result.source for result in results}

    def test_a_reference_that_cannot_be_staged_is_skipped_not_misplaced(
        self, tmp_path: pathlib.Path
    ) -> None:
        # The seed is simply not placed, which is visible as that object not being carried --
        # rather than as a mask attached to whichever picture happens to sit at that index.
        keys = sequence(5)
        predictor = FakePredictor()

        def reader(key: str):
            if key == keys[2]:
                raise OSError("corrupt")
            return image()

        run(predictor, request(5), [reference(2)], tmp_path, reader=reader)

        assert predictor.seeds == []


class TestAFrameOfTheWrongSIZE:
    """RULE-071: a frame whose size differs from the reference's is skipped and left out.

    Not a nicety. SAM 2's video state is built from one stack of frames, so a differently sized one
    is either rejected deep inside the loader -- ending a six-hundred-frame run over one bad image
    -- or silently resized, which moves every mask it produces. Skipping is the only one of those
    three outcomes that is honest, and it is what legacy does.
    """

    def reader_where(self, odd_key: str, size: tuple[int, int]):
        def reader(key: str):
            return image() if key != odd_key else np.full((*size, 3), 128, dtype=np.uint8)

        return reader

    def test_it_is_not_staged(self, tmp_path: pathlib.Path) -> None:
        keys = sequence(5)
        predictor = FakePredictor()

        results = run(
            predictor,
            request(5),
            [reference(0)],
            tmp_path,
            reader=self.reader_where(keys[2], (9, 9)),
        )

        assert results
        assert keys[2] not in {result.source for result in results}

    def test_the_others_still_land_on_the_right_images(self, tmp_path: pathlib.Path) -> None:
        # The same property RULE-017 is about: a frame dropped from the middle must not shift the
        # attribution of every frame after it.
        keys = sequence(5)
        predictor = FakePredictor()

        results = run(
            predictor,
            request(5),
            [reference(0)],
            tmp_path,
            reader=self.reader_where(keys[1], (9, 9)),
        )

        assert all(result.source in keys for result in results)
        assert keys[1] not in {result.source for result in results}

    def test_a_matching_size_is_kept(self, tmp_path: pathlib.Path) -> None:
        # The guard must not exclude frames that are simply fine.
        predictor = FakePredictor()

        results = run(predictor, request(5), [reference(0)], tmp_path)

        assert len({result.source for result in results}) > 1

    def test_the_REFERENCE_decides_the_size_not_the_first_frame(
        self, tmp_path: pathlib.Path
    ) -> None:
        # RULE-071 measures against the reference's size. With the reference at frame 3, a frame 0
        # of a different size is the odd one out -- not the other way round.
        keys = sequence(5)
        predictor = FakePredictor()

        results = run(
            predictor,
            request(5, references=(3,)),
            [reference(3)],
            tmp_path,
            reader=self.reader_where(keys[0], (9, 9)),
        )

        assert keys[0] not in {result.source for result in results}


class TestRefusals:
    def test_no_references_is_refused(self, tmp_path: pathlib.Path) -> None:
        # Legacy runs the whole sequence and writes an empty mask over every frame.
        with pytest.raises(InvalidPromptError, match="at least one reference"):
            run(FakePredictor(), request(4), [], tmp_path)

    def test_a_reference_outside_the_sequence_is_refused(self, tmp_path: pathlib.Path) -> None:
        with pytest.raises(InvalidPromptError, match="outside a sequence"):
            run(FakePredictor(), request(4), [reference(99)], tmp_path)


class TestCancelling:
    class Flag:
        def __init__(self, after: int) -> None:
            self.after = after
            self.checks = 0

        def is_set(self) -> bool:
            self.checks += 1
            return self.checks > self.after

    def test_a_cancel_before_the_first_window_does_nothing_at_all(
        self, tmp_path: pathlib.Path
    ) -> None:
        predictor = FakePredictor()

        results = run(predictor, request(4), [reference(0)], tmp_path, cancel=self.Flag(after=0))

        assert results == []
        assert predictor.states == []

    def test_it_is_checked_BETWEEN_windows_not_only_at_the_end(
        self, tmp_path: pathlib.Path
    ) -> None:
        # A window is up to 250 frames of GPU work. A Cancel that only took effect once the whole
        # run finished would look like a button that does nothing.
        predictor = FakePredictor()

        run(
            predictor,
            request(600, window=250),
            [reference(0)],
            tmp_path,
            cancel=self.Flag(after=2),
        )

        # Stopped early: the full plan is three forward windows plus the backward pass.
        assert len(predictor.states) < 4
