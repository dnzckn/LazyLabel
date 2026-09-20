"""The half of Find Archetypes that needs a model — with a stand-in for the model.

`test_archetypes.py` pins the allocation arithmetic. This pins the plumbing around it: what happens
to a frame that cannot be read, whether the features come back normalized, and whether the pipeline
holds together end to end. The stand-in model makes those answers exact, which the real MobileNetV3
cannot -- real features cluster how they cluster.

`test_archetypes_live.py` runs the real weights, and is the one that proves the stand-in is not
lying about the shape of the thing it stands in for.
"""

from __future__ import annotations

import importlib.util

import numpy as np
import pytest

from lazylabel_inference.archetypes import (
    EMBEDDING_DIM,
    Embedder,
    EmbeddingFailedError,
    TooFewFrames,
    centroid_distances,
    cluster,
    counts_of,
    embed,
    find_archetypes,
    load_embedder,
)
from lazylabel_inference.manifest import parse_manifest
from lazylabel_inference.prompts import ModelNotLoadedError

pytestmark = pytest.mark.skipif(
    importlib.util.find_spec("torch") is None or importlib.util.find_spec("torchvision") is None,
    reason="the AI stack is not installed",
)


def entry(**overrides):
    import json

    base = {
        "name": "MobileNetV3 small",
        "family": "embedder",
        "size": "mobilenet_v3_small",
        "filename": "mobilenetv3_small_tv.pth",
        "sha256": "b" * 64,
        "bytes": 10305097,
    }
    base.update(overrides)
    return parse_manifest(json.dumps({"models": [base]}))[0]


class ByBrightness:
    """A stand-in model whose features depend only on how bright the frame is.

    Enough to make clusters predictable: frames of the same shade land on the same feature vector,
    frames of different shades land far apart. The real model is far subtler, which is exactly why
    it is useless for asserting that a specific frame ends up in a specific cluster.
    """

    def __init__(self) -> None:
        self.batches: list[int] = []

    def __call__(self, batch):
        import torch

        self.batches.append(int(batch.shape[0]))
        out = torch.zeros(batch.shape[0], EMBEDDING_DIM)
        out[:, 0] = batch.mean(dim=(1, 2, 3)) * 10.0
        out[:, 1] = 1.0
        return out


def stand_in(model=None) -> Embedder:
    return Embedder(_entry=entry(), _model=model or ByBrightness(), _device="cpu")


def frame(shade: int, size: tuple[int, int] = (64, 80)):
    return np.full((size[0], size[1], 3), shade, dtype=np.uint8)


def sequence(counts: dict[int, int]) -> list[tuple[str, np.ndarray]]:
    """`{shade: how many}` as a timeline, named so the shade is recoverable from the key."""
    images = []
    for shade, count in counts.items():
        for index in range(count):
            images.append((f"s{shade}_{index:03d}.png", frame(shade)))
    return images


class TestEmbedding:
    def test_every_row_is_unit_length(self) -> None:
        # Clustering compares direction. A frame that is merely brighter must not read as a frame
        # that is different.
        embedded = embed(sequence({20: 3, 200: 3}), stand_in())

        norms = np.linalg.norm(embedded.features, axis=1)
        assert np.allclose(norms, 1.0)

    def test_an_all_black_frame_does_not_produce_nan(self) -> None:
        """The 1e-8 floor, which is load-bearing rather than defensive.

        A uniformly black frame embeds near zero under this stand-in, and dividing by its own norm
        without the floor gives infinities -- which propagate into every distance and make every
        cluster vanish. One unlabelled black frame at the start of a sequence would take the whole
        feature down with it.
        """
        embedded = embed([("black.png", np.zeros((32, 32, 3), dtype=np.uint8))], stand_in())

        assert np.isfinite(embedded.features).all()

    def test_a_frame_it_cannot_read_is_reported_rather_than_dropped(self) -> None:
        # Legacy logs a warning nobody sees and returns a shorter list. The count of suggestions
        # then silently excludes the frame, and the user has no way to learn that.
        images = [
            ("good.png", frame(20)),
            ("greyscale.png", np.zeros((32, 32), dtype=np.uint8)),  # no channel axis
            ("also-good.png", frame(200)),
        ]

        embedded = embed(images, stand_in())

        assert embedded.keys == ("good.png", "also-good.png")
        assert len(embedded.unreadable) == 1
        key, why = embedded.unreadable[0]
        assert key == "greyscale.png"
        assert "(32, 32)" in why

    def test_one_bad_frame_does_not_lose_the_rest_of_its_batch(self) -> None:
        images = [("bad.png", np.zeros((4, 4), dtype=np.uint8))] + sequence({30: 5})

        embedded = embed(images, stand_in(), batch_size=8)

        assert len(embedded.keys) == 5
        assert len(embedded.unreadable) == 1

    def test_batching_changes_nothing_about_the_result(self) -> None:
        images = sequence({20: 4, 120: 4, 220: 4})

        one_batch = embed(images, stand_in(), batch_size=64)
        many_batches = embed(images, stand_in(), batch_size=2)

        assert one_batch.keys == many_batches.keys
        assert np.allclose(one_batch.features, many_batches.features)

    def test_it_batches_rather_than_embedding_everything_at_once(self) -> None:
        # Not cosmetic: a thousand 224x224 frames in one tensor is where a sequence runs a machine
        # out of memory, and the failure looks like the feature being broken.
        model = ByBrightness()
        embed(sequence({20: 10}), stand_in(model), batch_size=4)

        assert model.batches == [4, 4, 2]

    def test_a_model_of_the_wrong_width_is_refused_rather_than_clustered(self) -> None:
        import torch

        class WrongWidth:
            def __call__(self, batch):
                return torch.zeros(batch.shape[0], 1000)  # the classifier head still attached

        with pytest.raises(EmbeddingFailedError, match="not 576-d"):
            embed(sequence({20: 2}), stand_in(WrongWidth()))

    def test_a_model_that_raises_is_an_error_not_an_empty_result(self) -> None:
        class Broken:
            def __call__(self, batch):
                raise RuntimeError("CUDA out of memory")

        with pytest.raises(EmbeddingFailedError, match="CUDA out of memory"):
            embed(sequence({20: 2}), stand_in(Broken()))


class TestClustering:
    def test_noise_is_not_a_cluster(self) -> None:
        assert counts_of([0, 0, 1, -1, -1, 1]) == {0: 2, 1: 2}

    def test_it_finds_the_groups_that_are_there(self) -> None:
        images = sequence({20: 20, 120: 20, 220: 20})
        embedded = embed(images, stand_in())

        labels = cluster(embedded.features, len(images))

        assert len(counts_of(labels)) == 3

    def test_distances_are_measured_from_the_cluster_centre(self) -> None:
        """The centre is a MEAN, so an outlier drags it — and that changes which frame wins.

        y values 0, 0.1 and 3.0 have a mean of 1.033, not 0.05. So the frame closest to the centre
        is the one at 0.1, NOT the one at 0.0 sitting in the denser part of the cluster. The
        ordering below is only explicable if the centroid really moved, which is what makes it
        worth asserting: a medoid picked against a robust centre (a median, say) would answer
        differently, and legacy uses the mean.
        """
        keys = ("at-zero.png", "at-tenth.png", "far.png")
        features = np.array([[1.0, 0.0], [1.0, 0.1], [1.0, 3.0]])

        distances = centroid_distances(keys, features, [0, 0, 0])

        ranked = sorted(distances[0], key=lambda entry: entry[1])
        assert [key for key, _ in ranked] == ["at-tenth.png", "at-zero.png", "far.png"]
        assert distances[0][2][1] == pytest.approx(1.9667, abs=1e-4)  # far, from a centre at 1.033

    def test_noise_frames_are_never_suggested(self) -> None:
        # A frame the clusterer could not place is the least representative thing in the sequence.
        distances = centroid_distances(
            ("a.png", "b.png", "noise.png"), np.array([[0.0], [1.0], [99.0]]), [0, 0, -1]
        )

        assert set(distances) == {0}
        assert "noise.png" not in [key for key, _ in distances[0]]


class TestLoading:
    def test_refuses_a_segmenter_checkpoint(self, tmp_path) -> None:
        # The families are not interchangeable, and loading SAM weights into MobileNetV3 would fail
        # deep inside torchvision with an error about tensor shapes.
        import json

        sam = parse_manifest(
            json.dumps(
                {
                    "models": [
                        {
                            "name": "SAM 1 huge",
                            "family": "sam1",
                            "size": "vit_h",
                            "filename": "sam_vit_h_4b8939.pth",
                            "sha256": "c" * 64,
                            "bytes": 2564550879,
                        }
                    ]
                }
            )
        )[0]

        with pytest.raises(ModelNotLoadedError, match="not an embedder"):
            load_embedder(sam, tmp_path)

    def test_refuses_a_checkpoint_that_is_not_there(self, tmp_path) -> None:
        with pytest.raises(ModelNotLoadedError, match="is not in"):
            load_embedder(entry(), tmp_path)

    def test_the_missing_file_error_names_the_directory(self, tmp_path) -> None:
        with pytest.raises(ModelNotLoadedError) as raised:
            load_embedder(entry(), tmp_path)
        assert str(tmp_path) in str(raised.value)

    def test_refuses_a_file_that_is_not_a_state_dict(self, tmp_path) -> None:
        # Nothing downloads a replacement. Legacy deletes the cached file and re-fetches, which
        # would silently discard a checkpoint the user deliberately put there.
        (tmp_path / entry().filename).write_bytes(b"not a checkpoint")

        with pytest.raises(ModelNotLoadedError, match="could not be loaded"):
            load_embedder(entry(), tmp_path)


class TestFindArchetypes:
    def test_refuses_a_sequence_too_short_to_cluster(self) -> None:
        with pytest.raises(TooFewFrames):
            find_archetypes(sequence({20: 3}), stand_in())

    def test_it_suggests_frames_from_every_group(self) -> None:
        images = sequence({20: 40, 120: 40, 220: 40})

        result = find_archetypes(images, stand_in())

        assert result.clusters == 3
        # One from each shade at least, so no stretch of the sequence is left with no reference.
        shades = {key.split("_")[0] for key in result.suggested}
        assert shades == {"s20", "s120", "s220"}

    def test_suggestions_come_back_in_timeline_order(self) -> None:
        # `choose` groups them by cluster, which is an artefact of how they were picked. A user
        # reads them against their sequence.
        images = sequence({220: 40, 20: 40, 120: 40})  # deliberately not in shade order

        result = find_archetypes(images, stand_in())

        order = {key: position for position, (key, _) in enumerate(images)}
        positions = [order[key] for key in result.suggested]
        assert positions == sorted(positions)

    def test_a_uniform_sequence_suggests_nothing_and_says_why(self) -> None:
        """Every frame identical: there are no distinct scenes to represent.

        An empty list rather than an exception, because nothing failed -- the honest answer to "which
        frames are most different from each other" on a sequence of identical frames is "none of
        them". `fell_short` is what lets a client say that instead of showing an empty panel.
        """
        result = find_archetypes(sequence({128: 60}), stand_in())

        assert result.suggested == ()
        assert result.fell_short
        assert result.noise == 60

    def test_unreadable_frames_survive_to_the_result(self) -> None:
        images = sequence({20: 30, 200: 30}) + [("broken.png", np.zeros((2, 2), dtype=np.uint8))]

        result = find_archetypes(images, stand_in())

        assert result.unreadable == (("broken.png", "expected (height, width, 3) RGB, got shape (2, 2)"),)

    def test_the_budget_counts_frames_it_could_not_read(self) -> None:
        """Legacy sizes the budget from the total, then allocates over only what it clustered.

        Reproduced rather than tidied: changing it would move the suggestions on every sequence
        containing an unreadable frame, and the discrepancy is now reported rather than hidden.
        """
        readable = sequence({20: 30, 200: 30})
        broken = [(f"broken{i}.png", np.zeros((2, 2), dtype=np.uint8)) for i in range(40)]

        result = find_archetypes(readable + broken, stand_in())

        assert result.budget == 5  # from 100 frames, not from the 60 that embedded
        assert len(result.unreadable) == 40
