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
        built=True,
        caveat=(
            "built: SAM 2.1 and SAM 1 prompts, the embedding handles, RULE-091's cache and the "
            "neighbour prefetch that warms it. The prefetch lives in the WEB app, which is the "
            "only side that knows the folder order. NOT claimed: the 150 ms p95 of RULE-074, "
            "which needs measuring on real hardware rather than asserting here"
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
            "there. The suggestions match legacy's ReferenceFinderWorker frame for frame on a "
            "90-frame, three-scene sequence (tests/test_differential_archetypes.py, with the "
            "embedder checkpoint). NOT claimed: the same on real footage, which no one has supplied"
        ),
    ),
    Capability(
        "C11",
        "Propagate labels through a sequence and review them by confidence",
        "P3",
        built=True,
        caveat=(
            "built: SAM 2 video propagation, RULE-026's streaming windows, the job API with real "
            "cancellation that keeps committed frames, and the video predictor they run on. Every "
            "mask, empty object and flag matches legacy's on the synthetic-shapes golden, frame for "
            "frame (tests/test_propagation_goldens.py, with a checkpoint). NOT claimed: the same for "
            "the streaming path, which only a sequence longer than the window takes, which no golden "
            "covers, and whose backward windows deliberately differ from legacy's -- legacy's come "
            "back empty after the first"
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
