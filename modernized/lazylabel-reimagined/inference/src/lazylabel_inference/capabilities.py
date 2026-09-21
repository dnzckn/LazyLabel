"""The capabilities this service owns, and whether they are built.

Phases here are for THIS service's share. Archetype finding (C10) and propagation (C11) are
Phase 3 work on the model side - the brief lists `reference_finder_worker.py` in Phase 3's scope,
and its exit criterion 2 requires propagation to meet tolerance - while the timeline UI that
drives them is Phase 6. An earlier revision marked both P6 here, which would have let Phase 3
close without them.

The same table the API and the web app keep, answering the third version of the question: what does
the INFERENCE service owe each capability, and does it do it yet. Only the four it touches are
listed; the other ten are somebody else's, and saying so here would be noise.

`tests/test_capabilities.py` fails if this table and the test suite disagree.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Capability:
    id: str
    summary: str
    phase: str
    built: bool
    missing: str = ""
    """What a BUILT capability still does not claim.

    Separate from `missing`, which says what is not built. C11 needs both ideas kept apart: the
    service does propagate now, and that its results match legacy is unproven -- collapsing the
    two would either understate the work or overstate the guarantee, and the second is worse.
    """
    caveat: str = ""


CAPABILITIES: list[Capability] = [
    Capability(
        "C3",
        "Segment an object by clicking or boxing it with SAM",
        "P3",
        built=False,
        missing=(
            "the SAM 1 backend, and the neighbour prefetch that makes the first click on the next "
            "image immediate. SAM 2.1 prompts, the embedding handles and the cache are built, and "
            "the prompts are proven against the legacy Sam2Model"
        ),
    ),
    Capability(
        "C10",
        "Build a timeline from an image sequence and mark reference frames",
        "P3",
        built=True,
        caveat=(
            "built: archetype finding -- embed, cluster, allocate, pick the medoids -- behind "
            "POST /inference/archetypes. The timeline itself belongs to the web app and is built "
            "there. NOT claimed: that the suggested frames match legacy's, which needs a "
            "checkpoint and a recorded sequence"
        ),
    ),
    Capability(
        "C11",
        "Propagate labels through a sequence and review them by confidence",
        "P3",
        built=True,
        caveat=(
            "built: SAM 2 video propagation, RULE-026's streaming windows, the job API with real "
            "cancellation that keeps committed frames, and the video predictor they run on. NOT "
            "claimed: that the masks and the flagged frames match legacy. Proving that needs a "
            "checkpoint and golden outputs, which is Phase 6 exit criterion 2"
        ),
    ),
    Capability(
        "C13",
        "Keep settings and hotkeys across sessions",
        "P2",
        built=False,
        missing="nothing: settings are the API's, and this service holds none",
    ),
]


def capability(identifier: str) -> Capability:
    for entry in CAPABILITIES:
        if entry.id == identifier:
            return entry
    raise KeyError(f"no capability {identifier} in this service's table")
