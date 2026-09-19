"""Choosing which frames to suggest as references — RULE-022.

Find Archetypes embeds every frame of a sequence, clusters them, and suggests a handful as
reference frames worth labelling by hand. The embedding and the clustering need a model; the
ALLOCATION does not, and the allocation is the part the rule card specifies to the frame.

It is also the part worth pinning. A user with a 1,000-frame sequence is told to label twenty
frames, and which twenty decides how good the propagation is. Getting the split wrong by one gives
a cluster no representative at all, and a cluster with no reference is a stretch of the sequence
propagating from nothing.

Transliterated from `ui/workers/reference_finder_worker.py:202-263`, including the two loops that
settle the remainder, because the order they run in is visible in the answer.
"""

from __future__ import annotations

from dataclasses import dataclass


class TooFewFrames(Exception):
    """Fewer frames than clustering can say anything useful about."""


MINIMUM_FRAMES = 5


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
