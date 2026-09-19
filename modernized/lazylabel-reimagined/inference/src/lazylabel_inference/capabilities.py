"""The capabilities this service owns, and whether they are built.

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


CAPABILITIES: list[Capability] = [
    Capability(
        "C3",
        "Segment an object by clicking or boxing it with SAM",
        "P3",
        built=False,
        missing="the SAM 1 and SAM 2.1 predictors, embedding handles and their cache",
    ),
    Capability(
        "C10",
        "Build a timeline from an image sequence and mark reference frames",
        "P6",
        built=False,
        missing="archetype finding; the timeline itself belongs to the web app",
    ),
    Capability(
        "C11",
        "Propagate labels through a sequence and review them by confidence",
        "P6",
        built=False,
        missing="SAM 2 video propagation, chunked jobs, cancellation and staged frame results",
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
