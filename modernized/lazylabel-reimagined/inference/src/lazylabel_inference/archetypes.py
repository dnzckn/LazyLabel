"""Choosing which frames to suggest as references — RULE-022.

Find Archetypes embeds every frame of a sequence, clusters them, and suggests a handful as
reference frames worth labelling by hand. The ALLOCATION needs no model and is the part the rule
card specifies to the frame; the embedding and the clustering need one, and live lower down.

The allocation is the part worth pinning hardest. A user with a 1,000-frame sequence is told to
label twenty frames, and which twenty decides how good the propagation is. Getting the split wrong
by one gives a cluster no representative at all, and a cluster with no reference is a stretch of
the sequence propagating from nothing.

Transliterated from `ui/workers/reference_finder_worker.py`, including the two loops that settle
the remainder, because the order they run in is visible in the answer.

Three things are deliberately NOT transliterated:

  - Legacy DOWNLOADS the MobileNetV3 weights from torchvision the first time this runs, and falls
    back to instructions telling the user to download them by hand. Nothing here fetches a model at
    runtime (SEC-03, SEC-05, SEC-17): the embedder is a manifest entry like any checkpoint, hashed
    before it is read, and absent means an error rather than a download.
  - Legacy SKIPS a frame it cannot open, with a `logger.warning` the user never sees, and then
    reports a suggestion count that silently excludes it. Unreadable frames are returned here.
  - Legacy breaks distance ties with `np.argsort`, which is quicksort and NOT stable, so two
    equidistant frames can come back in either order. `choose` breaks ties by key.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .availability import INSTALL_HINT
from .manifest import ModelEntry
from .prompts import InferenceError, ModelNotLoadedError


class TooFewFrames(Exception):
    """Fewer frames than clustering can say anything useful about."""


class EmbeddingFailedError(InferenceError):
    """Embedding ran and raised. Never a silently shorter list of suggestions."""


MINIMUM_FRAMES = 5

EMBEDDING_DIM = 576
"""MobileNetV3-small's penultimate width, once the classifier head is replaced by an identity.

Asserted rather than assumed at load time: a checkpoint that produces a different width is a
different model, and it would otherwise show up as clustering that is merely a bit worse.
"""

DEFAULT_BATCH_SIZE = 32
GPU_BATCH_SIZE = 128
"""Legacy's two sizes, kept: 32 on CPU, 128 on a GPU. They change throughput, never the result."""

# ImageNet statistics, because the weights are ImageNet weights. Feeding un-normalized pixels to
# them does not error, it just makes every frame look more alike than it is -- which comes out as
# too few clusters and a worse set of suggestions.
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


def budget_for(frame_count: int) -> int:
    """How many frames to suggest: about 2%, never fewer than 5 or more than 50.

    `int()` truncates, so 249 frames gives 4 -> raised to the floor of 5, and 250 gives exactly 5.
    """
    return max(5, min(50, int(frame_count * 0.02)))


def minimum_cluster_size(frame_count: int) -> int:
    """The smallest group the clusterer is allowed to call a cluster."""
    return max(5, frame_count // 100)


@dataclass(frozen=True)
class Allocation:
    """How many frames each cluster contributes, and the budget they were drawn from."""

    per_cluster: dict[int, int]
    budget: int

    @property
    def total(self) -> int:
        return sum(self.per_cluster.values())


def allocate(cluster_counts: dict[int, int], frame_count: int) -> Allocation:
    """Split the budget across clusters by size, with at least one frame from each.

    Three steps, and the second and third are where legacy's exact behaviour lives:

    1. proportional, truncated, but never zero -- a cluster with no reference is a stretch of the
       sequence with nothing to propagate from;
    2. while over budget, take one from whichever cluster currently has the MOST, and stop if that
       would take a cluster to zero;
    3. while under budget, give one to whichever cluster has the most SPARE frames, breaking ties
       by cluster size, and stop if it has none to give.

    Step 2 can leave the total above budget and step 3 can leave it below: both loops break rather
    than loop forever when no move is legal. That is legacy's behaviour and it is the right one --
    exceeding the budget slightly beats dropping a cluster entirely.
    """
    if frame_count < MINIMUM_FRAMES:
        raise TooFewFrames(
            f"{frame_count} frames is fewer than the {MINIMUM_FRAMES} this needs to say anything"
        )
    if not cluster_counts:
        raise TooFewFrames("no clusters were found in this sequence")

    budget = budget_for(frame_count)
    clustered = sum(cluster_counts.values())
    if clustered <= 0:
        raise TooFewFrames("every frame was treated as noise; there is nothing to sample from")

    allocation = {
        label: max(1, int(budget * count / clustered)) for label, count in cluster_counts.items()
    }

    while sum(allocation.values()) > budget:
        largest = max(allocation, key=lambda k: allocation[k])
        if allocation[largest] <= 1:
            break  # every cluster is down to its last frame; keeping them all beats the budget
        allocation[largest] -= 1

    while sum(allocation.values()) < budget:
        # The extra slot goes to the cluster with the most frames to spare, so a big cluster that is
        # already well covered does not take it from one that is not.
        best = max(
            allocation,
            key=lambda k: (cluster_counts[k] - allocation[k], cluster_counts[k]),
        )
        if allocation[best] >= cluster_counts[best]:
            break  # nothing left to give: every cluster is fully represented
        allocation[best] += 1

    return Allocation(per_cluster=allocation, budget=budget)


def choose(
    cluster_counts: dict[int, int],
    distances: dict[int, list[tuple[str, float]]],
    frame_count: int,
) -> list[str]:
    """The frames to suggest: the closest to each cluster's centre, by the allocation.

    `distances` maps a cluster label to its frames with their distance from that cluster's centre.
    The closest are the most representative, which is what makes them worth labelling by hand.

    Ties are broken by the frame key, so the same sequence always yields the same suggestions --
    otherwise a user re-running Find Archetypes would be offered a different set for no reason.
    """
    allocation = allocate(cluster_counts, frame_count)

    chosen: list[str] = []
    for label in sorted(allocation.per_cluster):
        take = allocation.per_cluster[label]
        ranked = sorted(distances.get(label, []), key=lambda entry: (entry[1], entry[0]))
        chosen.extend(key for key, _ in ranked[:take])

    return chosen


# --------------------------------------------------------------------------------------------
# The half that needs a model: turning frames into features, and features into clusters.
# --------------------------------------------------------------------------------------------


@dataclass
class Embedder:
    """MobileNetV3-small with its classifier head removed, so it emits features instead of labels."""

    _entry: ModelEntry
    _model: Any
    _device: str

    @property
    def entry(self) -> ModelEntry:
        return self._entry

    @property
    def device(self) -> str:
        return self._device

    @property
    def batch_size(self) -> int:
        return GPU_BATCH_SIZE if self._device.startswith("cuda") else DEFAULT_BATCH_SIZE


def load_embedder(entry: ModelEntry, model_dir: Path, *, device: str | None = None) -> Embedder:
    """Load the feature extractor from a manifest entry. Never from the network.

    `weights=None` is the whole security posture in one argument: it builds the architecture and
    downloads nothing, so the only bytes that reach the model are the ones the manifest vouched for.
    Legacy's equivalent call passes the torchvision weights enum, which fetches ~10 MB from the
    internet on first run and, if the cached copy fails to load, DELETES it and fetches again.

    `strict=True` on the state dict matters for the same reason the manifest does: a checkpoint that
    only partly matches is a different model, and partial loading would leave randomly initialised
    layers producing features that look plausible and cluster badly.
    """
    if entry.family != "embedder":
        raise ModelNotLoadedError(
            f"{entry.name} is a {entry.family} checkpoint, not an embedder"
        )
    if entry.size != "mobilenet_v3_small":
        raise ModelNotLoadedError(f"no embedder is known for size {entry.size!r}")

    checkpoint = model_dir / entry.filename
    if not checkpoint.is_file():
        raise ModelNotLoadedError(f"{entry.filename} is not in {model_dir}")

    try:
        import torch
        from torch import nn
        from torchvision.models import mobilenet_v3_small
    except ImportError as cause:
        raise ModelNotLoadedError(
            f"the AI stack is not installed: {cause}. "
            f"{INSTALL_HINT}."
        ) from cause

    resolved = device or ("cuda" if torch.cuda.is_available() else "cpu")

    try:
        state = torch.load(checkpoint, map_location="cpu", weights_only=True)
        model = mobilenet_v3_small(weights=None)
        model.load_state_dict(state, strict=True)
        model.classifier = nn.Identity()
        model.eval()
        model.to(resolved)
    except Exception as cause:
        raise ModelNotLoadedError(
            f"{entry.name} could not be loaded from {entry.filename}: {cause}"
        ) from cause

    return Embedder(_entry=entry, _model=model, _device=resolved)


@dataclass(frozen=True)
class Embedded:
    """Features for the frames that could be read, and the names of the ones that could not."""

    keys: tuple[str, ...]
    features: Any  # numpy.ndarray of shape (len(keys), EMBEDDING_DIM), each row L2-normalized
    unreadable: tuple[tuple[str, str], ...] = field(default_factory=tuple)
    """(key, why) for each frame that could not be embedded. Legacy logged these and moved on."""


def _preprocessor() -> Any:
    """Legacy's exact transform chain.

    Worth stating what `Resize(256)` then `CenterCrop(224)` means for the result, because it is a
    property of the suggestions and not an implementation detail: the shorter side goes to 256 and
    the centre 224 square is kept, so a WIDE frame is judged on its middle and the edges never reach
    the model. Two frames that differ only at the edges therefore look identical to the clusterer.
    """
    from torchvision import transforms

    return transforms.Compose(
        [
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(mean=list(IMAGENET_MEAN), std=list(IMAGENET_STD)),
        ]
    )


def embed(
    images: list[tuple[str, Any]],
    embedder: Embedder,
    *,
    batch_size: int | None = None,
) -> Embedded:
    """Embed every frame, in batches, as L2-normalized feature rows.

    `images` is (dataset key, RGB uint8 array), the same pairing `stage_sequence` takes -- the
    decode happens upstream under the API's format allow-list, so nothing here opens a file and
    SEC-02 is not re-litigated in a second place.

    IN PLACE OF THE ARRAY, A FUNCTION THAT READS IT, which is what the service passes: each frame is
    then decoded when its batch comes up, shrunk to the model's 224 square and let go, so a
    sequence of large photos is in memory one at a time. Reading every frame first held them all
    at once: 86 wedding photos of about 17 MB each, some ten gigabytes decoded, took the inference
    service down with them on 2026-09-29. A reader that raises is an unreadable frame like any
    other.

    A frame that cannot be turned into a tensor is recorded and skipped; a failure of the MODEL is
    raised. The difference is the point: one bad frame should not lose the other nine hundred, and a
    model that has stopped working should not look like a sequence of bad frames.
    """
    import numpy as np
    import torch
    from PIL import Image

    transform = _preprocessor()
    size = batch_size or embedder.batch_size

    keys: list[str] = []
    blocks: list[Any] = []
    unreadable: list[tuple[str, str]] = []

    for start in range(0, len(images), size):
        batch = images[start : start + size]
        tensors: list[Any] = []
        batch_keys: list[str] = []

        for key, source in batch:
            try:
                pixels = np.asarray(source() if callable(source) else source)
                if pixels.ndim != 3 or pixels.shape[2] != 3:
                    raise ValueError(f"expected (height, width, 3) RGB, got shape {pixels.shape}")
                # No copy of a frame that is already uint8: a large photo is big enough once.
                tensors.append(transform(Image.fromarray(pixels.astype(np.uint8, copy=False))))
                batch_keys.append(key)
            except Exception as cause:
                unreadable.append((key, str(cause)))
            finally:
                pixels = None

        if not tensors:
            continue

        try:
            stacked = torch.stack(tensors).to(embedder.device)
            with torch.no_grad():
                features = embedder._model(stacked).cpu().numpy()
        except Exception as cause:
            raise EmbeddingFailedError(f"the embedder raised on a batch of frames: {cause}") from cause

        if features.shape[1] != EMBEDDING_DIM:
            raise EmbeddingFailedError(
                f"the embedder produced {features.shape[1]}-d features, not {EMBEDDING_DIM}-d; "
                "this checkpoint is not MobileNetV3-small with its head removed"
            )

        # L2-normalize, so clustering compares DIRECTION and a brighter frame is not automatically
        # far from a darker one. The 1e-8 floor is legacy's, and it is load-bearing: a uniformly
        # black frame embeds near zero, and dividing by its norm would give infinities that make
        # every distance NaN and every cluster vanish.
        norms = np.maximum(np.linalg.norm(features, axis=1, keepdims=True), 1e-8)
        blocks.append(features / norms)
        keys.extend(batch_keys)

    stacked_features = np.vstack(blocks) if blocks else np.zeros((0, EMBEDDING_DIM), dtype="float32")
    return Embedded(keys=tuple(keys), features=stacked_features, unreadable=tuple(unreadable))


def cluster(features: Any, frame_count: int) -> Any:
    """Group the frames by appearance. Returns one label per row, with -1 meaning noise.

    HDBSCAN rather than k-means because the number of distinct scenes in a sequence is exactly what
    nobody knows in advance, and because it is allowed to call a frame noise instead of forcing it
    into the nearest cluster. `copy=True` is legacy's and is kept deliberately: the caller needs
    these same features afterwards to compute centroids, and clustering must not have altered them.
    """
    try:
        from sklearn.cluster import HDBSCAN
    except ImportError as cause:
        raise ModelNotLoadedError(f"scikit-learn is not installed: {cause}") from cause

    clusterer = HDBSCAN(
        min_cluster_size=minimum_cluster_size(frame_count), metric="euclidean", copy=True
    )
    return clusterer.fit_predict(features)


def counts_of(labels: Any) -> dict[int, int]:
    """How many frames landed in each cluster, noise excluded."""
    counts: dict[int, int] = {}
    for label in labels:
        label = int(label)
        if label == -1:
            continue
        counts[label] = counts.get(label, 0) + 1
    return counts


def centroid_distances(
    keys: tuple[str, ...], features: Any, labels: Any
) -> dict[int, list[tuple[str, float]]]:
    """Each cluster's frames with their distance from that cluster's centre.

    The centre is the mean of the cluster's rows -- not necessarily any real frame -- and the
    closest real frame to it is the medoid, which is what makes it the one worth labelling.
    """
    import numpy as np

    grouped: dict[int, list[int]] = {}
    for row, label in enumerate(labels):
        label = int(label)
        if label == -1:
            continue
        grouped.setdefault(label, []).append(row)

    distances: dict[int, list[tuple[str, float]]] = {}
    for label, rows in grouped.items():
        members = features[rows]
        spread = np.linalg.norm(members - members.mean(axis=0), axis=1)
        distances[label] = [(keys[row], float(d)) for row, d in zip(rows, spread)]

    return distances


@dataclass(frozen=True)
class Archetypes:
    """What Find Archetypes suggests, and enough about how it got there to explain itself."""

    suggested: tuple[str, ...]
    budget: int
    clusters: int
    noise: int
    unreadable: tuple[tuple[str, str], ...] = field(default_factory=tuple)

    @property
    def fell_short(self) -> bool:
        """True when fewer frames were found than the budget asked for.

        Legacy computes the same comparison to choose between two progress messages and then throws
        it away. It is worth keeping: it is the difference between "here are your twenty frames" and
        "this sequence is too uniform to find twenty distinct ones", and a user who cannot tell
        those apart will assume the feature is broken.
        """
        return len(self.suggested) < self.budget


def find_archetypes(
    images: list[tuple[str, Any]],
    embedder: Embedder,
    *,
    batch_size: int | None = None,
) -> Archetypes:
    """The whole feature: embed, cluster, allocate, and pick the medoids.

    Note which count feeds the budget. Legacy sizes both the budget and the minimum cluster size
    from the TOTAL number of frames, including any it failed to read, while allocating
    proportionally across only the frames it managed to cluster. That is reproduced rather than
    tidied: changing it would shift the suggestions on every sequence with an unreadable frame, and
    the unreadable frames are now reported anyway, so the discrepancy is visible instead of hidden.
    """
    total = len(images)
    if total < MINIMUM_FRAMES:
        raise TooFewFrames(
            f"{total} frames is fewer than the {MINIMUM_FRAMES} this needs to say anything"
        )

    embedded = embed(images, embedder, batch_size=batch_size)
    if len(embedded.keys) == 0:
        raise TooFewFrames("no frame in this sequence could be embedded")

    labels = cluster(embedded.features, total)
    counts = counts_of(labels)
    noise = sum(1 for label in labels if int(label) == -1)

    if not counts:
        # Every frame was noise: the sequence is either too short or too uniform to have scenes.
        # An empty suggestion list with the reason attached, not an exception -- nothing failed.
        return Archetypes(
            suggested=(),
            budget=budget_for(total),
            clusters=0,
            noise=noise,
            unreadable=embedded.unreadable,
        )

    distances = centroid_distances(embedded.keys, embedded.features, labels)
    chosen = choose(counts, distances, total)

    # Back into timeline order. `choose` returns them grouped by cluster, which is an artefact of
    # how they were picked; a user reads them against their sequence.
    order = {key: position for position, (key, _) in enumerate(images)}
    ordered = tuple(sorted(dict.fromkeys(chosen), key=lambda key: order.get(key, len(images))))

    return Archetypes(
        suggested=ordered,
        budget=budget_for(total),
        clusters=len(counts),
        noise=noise,
        unreadable=embedded.unreadable,
    )
