"""RULE-022: which frames Find Archetypes suggests.

The rule card works one case all the way through -- budget 20 across clusters of 12, 6 and 1,
topped up to 13/6/1 with the extra slot going to the cluster with the most spare frames -- so that
case is the anchor here.

Worth pinning because a user with a thousand frames is told to label twenty, and which twenty
decides how good the propagation is. A cluster left with no representative is a stretch of the
sequence propagating from nothing.
"""

from __future__ import annotations

import pytest

from lazylabel_inference.archetypes import (
    MINIMUM_FRAMES,
    TooFewFrames,
    allocate,
    budget_for,
    choose,
    minimum_cluster_size,
)


class TestBudget:
    @pytest.mark.parametrize(
        ("frames", "expected"),
        [
            (5, 5),  # the floor
            (100, 5),  # 2% is 2, raised to the floor
            (249, 5),  # int() truncates 4.98 to 4, then the floor
            (250, 5),  # exactly 5
            (300, 6),
            (1000, 20),  # the card's worked example
            (2500, 50),  # the ceiling
            (100_000, 50),  # still the ceiling
        ],
    )
    def test_is_about_two_percent_between_five_and_fifty(self, frames: int, expected: int) -> None:
        assert budget_for(frames) == expected

    def test_truncates_rather_than_rounding(self) -> None:
        # int(), not round(): 1249 * 0.02 is 24.98 and gives 24, not 25.
        assert budget_for(1249) == 24
        assert budget_for(1250) == 25


class TestMinimumClusterSize:
    @pytest.mark.parametrize(("frames", "expected"), [(5, 5), (100, 5), (500, 5), (1000, 10), (5000, 50)])
    def test_is_one_percent_with_a_floor_of_five(self, frames: int, expected: int) -> None:
        assert minimum_cluster_size(frames) == expected


class TestAllocation:
    def test_the_worked_example_from_the_card(self) -> None:
        # The card's split: budget 20, proportional gives 12/6/1 (19), and the spare slot goes to
        # the cluster with the most frames left over, making it 13/6/1. Clusters of 620/330/50
        # produce exactly that -- 12.4, 6.6 and 1.0, all truncated.
        allocation = allocate({0: 620, 1: 330, 2: 50}, 1000)

        assert allocation.budget == 20
        assert allocation.per_cluster == {0: 13, 1: 6, 2: 1}
        assert allocation.total == 20

    def test_a_proportional_split_that_already_spends_the_budget_is_left_alone(self) -> None:
        # 600/300/100 gives 12/6/2, which is exactly 20, so neither loop runs. Worth pinning
        # separately from the card's case: it is the branch where the remainder never needs settling.
        assert allocate({0: 600, 1: 300, 2: 100}, 1000).per_cluster == {0: 12, 1: 6, 2: 2}

    def test_every_cluster_gets_at_least_one(self) -> None:
        # A tiny cluster would round to zero proportionally. A cluster with no reference frame is a
        # stretch of the sequence with nothing to propagate from.
        allocation = allocate({0: 980, 1: 10, 2: 10}, 1000)

        assert min(allocation.per_cluster.values()) >= 1
        assert set(allocation.per_cluster) == {0, 1, 2}

    def test_spends_the_whole_budget_when_it_can(self) -> None:
        for counts in [{0: 50, 1: 50}, {0: 30, 1: 30, 2: 40}, {0: 97, 1: 2, 2: 1}]:
            allocation = allocate(counts, 1000)
            assert allocation.total == allocation.budget, counts

    def test_the_proportional_step_can_ask_for_more_than_a_cluster_holds(self) -> None:
        """A legacy quirk, reproduced rather than fixed, because selection already handles it.

        `max(1, int(budget * count / total))` is not capped at the cluster's size, so two clusters
        of two frames against a budget of twenty are each allocated ten. Only the TOP-UP loop
        checks the cap. It is harmless because `choose` takes the closest `n` frames and a cluster
        with two frames yields two -- but an implementation that "fixed" it here would allocate
        differently from legacy on every small-cluster sequence, and the suggestions would diverge.
        """
        allocation = allocate({0: 2, 1: 2}, 1000)
        assert allocation.per_cluster == {0: 10, 1: 10}

        # And selection is where it comes back to earth.
        distances = {0: [("a.png", 0.1), ("b.png", 0.2)], 1: [("c.png", 0.1), ("d.png", 0.2)]}
        assert len(choose({0: 2, 1: 2}, distances, 1000)) == 4

    def test_stops_rather_than_looping_when_nothing_can_be_given(self) -> None:
        # Three clusters of one frame each against a budget of five. The minimum-one rule gives
        # 1/1/1, the top-up loop finds no cluster with a spare frame, and it stops instead of
        # spinning forever.
        allocation = allocate({0: 1, 1: 1, 2: 1}, 100)

        assert allocation.budget == 5
        assert allocation.total == 3

    def test_keeps_every_cluster_rather_than_meeting_the_budget(self) -> None:
        # Twenty-five clusters against a budget of 5: the minimum-one rule wins, and the total
        # exceeds the budget. Exceeding it slightly beats dropping twenty clusters entirely.
        allocation = allocate({label: 10 for label in range(25)}, 100)

        assert allocation.budget == 5
        assert allocation.total == 25
        assert all(take == 1 for take in allocation.per_cluster.values())

    def test_gives_the_spare_slot_to_the_cluster_with_the_most_left_over(self) -> None:
        # Both clusters start at 10 of a 20 budget with nothing spare to settle; make one much
        # larger and the extra slots should follow the frames it still has in reserve.
        allocation = allocate({0: 900, 1: 100}, 1000)
        assert allocation.per_cluster[0] > allocation.per_cluster[1]

    def test_refuses_a_sequence_too_short_to_cluster(self) -> None:
        with pytest.raises(TooFewFrames):
            allocate({0: 2}, MINIMUM_FRAMES - 1)

    def test_refuses_when_nothing_was_clustered(self) -> None:
        with pytest.raises(TooFewFrames, match="no clusters"):
            allocate({}, 1000)
        with pytest.raises(TooFewFrames, match="noise"):
            allocate({0: 0}, 1000)


class TestChoosing:
    def distances(self) -> dict[int, list[tuple[str, float]]]:
        return {
            0: [("f00.png", 0.9), ("f01.png", 0.1), ("f02.png", 0.5)],
            1: [("f10.png", 0.4), ("f11.png", 0.2)],
        }

    def test_takes_the_frames_closest_to_each_cluster_centre(self) -> None:
        chosen = choose({0: 3, 1: 2}, self.distances(), 250)

        # The closest frame is the most representative, which is what makes it worth labelling.
        assert "f01.png" in chosen
        assert "f11.png" in chosen

    def test_takes_as_many_as_the_allocation_says(self) -> None:
        allocation = allocate({0: 3, 1: 2}, 250)
        chosen = choose({0: 3, 1: 2}, self.distances(), 250)

        assert len(chosen) == allocation.total

    def test_is_stable_across_runs(self) -> None:
        # A user re-running Find Archetypes should be offered the same frames, not a different set
        # for no reason they can see.
        first = choose({0: 3, 1: 2}, self.distances(), 250)
        second = choose({0: 3, 1: 2}, self.distances(), 250)
        assert first == second

    def test_breaks_ties_by_frame_name_rather_than_arbitrarily(self) -> None:
        tied = {0: [("b.png", 0.5), ("a.png", 0.5), ("c.png", 0.5)]}
        assert choose({0: 3}, tied, 250)[:2] == ["a.png", "b.png"]

    def test_takes_nothing_from_a_cluster_with_no_distances_recorded(self) -> None:
        # A missing cluster is a bug upstream, but it must not become an exception here: the other
        # clusters' suggestions are still worth having.
        chosen = choose({0: 3, 1: 2}, {0: [("f01.png", 0.1)]}, 250)
        assert chosen == ["f01.png"]
