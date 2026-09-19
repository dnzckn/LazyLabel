"""The capability table must match the specification and the suite.

The Node packages keep the same guard. Its job is to make the pending placeholders safe: a
capability marked built with nothing testing it, or a pending one whose placeholder was deleted
along with the work that was meant to replace it, fails here rather than passing quietly.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from lazylabel_inference.capabilities import CAPABILITIES, capability

SPEC = Path(__file__).resolve().parents[4] / "analysis" / "lazylabel" / "AI_NATIVE_SPEC.md"

# The routes this service exposes for a capability that is not built, and the marker that holds the
# place. Kept beside the table so the two cannot drift apart unnoticed.
PENDING = {"C3", "C10", "C11"}


def test_the_specification_is_where_this_test_expects_it() -> None:
    # A silently missing specification would make every check below vacuously true.
    assert SPEC.is_file(), f"the specification is not at {SPEC}"


def test_every_capability_here_exists_in_the_specification() -> None:
    listed = set(re.findall(r"^\|\s*(C\d+)\s*\|", SPEC.read_text(encoding="utf-8"), re.M))
    assert listed, "no capability rows were found in the specification"

    for entry in CAPABILITIES:
        assert entry.id in listed, f"{entry.id} is not a capability in the specification"


def test_nothing_is_marked_built_yet() -> None:
    # Phase 2 scaffolds this service; Phase 3 builds it. If this ever fails, the table is claiming
    # work that the routes do not do, which is the one direction that matters.
    assert not any(entry.built for entry in CAPABILITIES)


def test_the_pending_set_matches_the_table() -> None:
    from_table = {entry.id for entry in CAPABILITIES if not entry.built and entry.missing}
    # C13 is listed with "nothing missing": settings are the API's, and this service holds none.
    assert from_table - {"C13"} == PENDING


@pytest.mark.parametrize("entry", CAPABILITIES, ids=lambda entry: entry.id)
def test_every_unbuilt_capability_names_a_phase_and_what_is_missing(entry) -> None:
    if entry.built:
        return
    assert entry.phase, f"{entry.id} has no phase"
    assert entry.missing, f"{entry.id} does not say what is missing"


def test_capability_lookup_refuses_an_unknown_id() -> None:
    assert capability("C3").phase == "P3"
    with pytest.raises(KeyError):
        capability("C99")
