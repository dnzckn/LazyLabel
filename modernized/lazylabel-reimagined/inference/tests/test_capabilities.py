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
PENDING: set[str] = set()


def test_the_specification_is_where_this_test_expects_it() -> None:
    # A silently missing specification would make every check below vacuously true.
    assert SPEC.is_file(), f"the specification is not at {SPEC}"


def test_every_capability_here_exists_in_the_specification() -> None:
    listed = set(re.findall(r"^\|\s*(C\d+)\s*\|", SPEC.read_text(encoding="utf-8"), re.M))
    assert listed, "no capability rows were found in the specification"

    for entry in CAPABILITIES:
        assert entry.id in listed, f"{entry.id} is not a capability in the specification"


def test_only_what_the_routes_actually_do_is_marked_built() -> None:
    """This test used to assert that NOTHING was built, and C11 is why it no longer can.

    The direction that matters has not changed: the table must never claim work the routes do not
    do. What changed is that all four now do it. C3 was the last, and its "missing" line had gone
    stale in both halves: the SAM 1 backend was built, and the neighbour prefetch turned out to
    belong to the WEB app, since the service is handed one image key and never learns the folder
    order.
    """
    built = {entry.id for entry in CAPABILITIES if entry.built}

    assert built == {"C3", "C10", "C11"}


def test_a_built_capability_says_what_it_does_NOT_claim() -> None:
    # The whole reason C11 can be marked built without overstating it. "The service propagates" and
    # "its results match legacy" are different promises. Since 2026-09-23 the second is kept for
    # the path a golden covers, and the caveat has to say which path that is.
    caveat = capability("C11").caveat

    assert "NOT claimed" in caveat
    assert "golden" in caveat and "streaming path" in caveat


def test_c3_records_what_is_left_rather_than_what_it_started_as() -> None:
    """A line that never changes is how a table stops being read -- and this one had stopped.

    It claimed the SAM 1 backend was missing long after `load_backend` handled the family, and it
    claimed the neighbour prefetch was this service's to build when the service is handed one image
    key and never learns what folder it came from.
    """
    caveat = capability("C3").caveat

    assert "SAM 1" in caveat
    assert "WEB app" in caveat
    assert capability("C3").missing == ""


def test_the_pending_set_matches_the_table() -> None:
    """Empty now, and kept rather than deleted.

    It is the guard that would catch a capability being marked built with nothing behind it, and
    the next one to be added needs it in place.
    """
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
