"""RULE-084: whether the AI stack is present and new enough.

The interesting cases are the ones that crash the legacy check. It does

    [int(p) for p in torch.__version__.split("+")[0].split(".")[:3]]

inside a guard that catches only ImportError, so a nightly PyTorch reporting "2.8.0a0" raises
ValueError and stops the application from starting. Every version string below can be tested here
without installing the build that produces it, which is the point of injecting it.
"""

from __future__ import annotations

import pytest

from lazylabel_inference.availability import (
    MIN_TORCH_VERSION,
    check_availability,
    parse_version,
)


class TestParseVersion:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("2.7.1", (2, 7, 1)),
            ("2.7.1+cu124", (2, 7, 1)),
            ("2.8.0a0", (2, 8, 0)),
            ("2.10.0rc1", (2, 10, 0)),
            ("2.7.1.dev20250101+cpu", (2, 7, 1)),
            ("3", (3, 0, 0)),
            ("2.9", (2, 9, 0)),
        ],
    )
    def test_reads_the_numeric_parts(self, raw: str, expected: tuple[int, int, int]) -> None:
        version = parse_version(raw)
        assert version is not None
        assert version.as_tuple() == expected

    @pytest.mark.parametrize("raw", ["2.8.0a0", "2.10.0rc1", "2.7.1.dev20250101"])
    def test_marks_a_pre_release_as_one(self, raw: str) -> None:
        version = parse_version(raw)
        assert version is not None and version.prerelease

    def test_does_not_mark_a_release_as_pre_release(self) -> None:
        version = parse_version("2.7.1+cu124")
        assert version is not None and not version.prerelease

    @pytest.mark.parametrize("raw", ["", "unknown", "v2.7.1", "not a version"])
    def test_returns_none_rather_than_raising(self, raw: str) -> None:
        # The whole point. Legacy raises here, inside a handler that catches only ImportError.
        assert parse_version(raw) is None


class TestCheckAvailability:
    def test_available_when_new_enough_and_sam_is_installed(self) -> None:
        result = check_availability(torch_version="2.7.1", has_sam=True)
        assert result.available
        assert "2.7.1" in result.reason

    def test_unavailable_when_torch_is_too_old(self) -> None:
        result = check_availability(torch_version="2.6.0+cu124", has_sam=True)
        assert not result.available
        assert "older than" in result.reason

    def test_unavailable_when_torch_is_missing(self) -> None:
        result = check_availability(torch_version=None, has_sam=True)
        assert not result.available
        assert "not installed" in result.reason

    def test_unavailable_when_segment_anything_is_missing(self) -> None:
        result = check_availability(torch_version="2.7.1", has_sam=False)
        assert not result.available
        assert "segment-anything" in result.reason

    def test_a_pre_release_newer_than_the_minimum_is_allowed_and_said_to_be_one(self) -> None:
        # Legacy does not disable the AI features for this build; it fails to start at all.
        result = check_availability(torch_version="2.8.0a0", has_sam=True)
        assert result.available
        assert "pre-release" in result.reason

    def test_an_unreadable_version_disables_rather_than_crashes(self) -> None:
        result = check_availability(torch_version="wobble", has_sam=True)
        assert not result.available
        assert "cannot be read" in result.reason

    def test_the_exact_minimum_is_accepted(self) -> None:
        minimum = ".".join(str(part) for part in MIN_TORCH_VERSION)
        assert check_availability(torch_version=minimum, has_sam=True).available

    def test_one_patch_below_the_minimum_is_not(self) -> None:
        major, minor, patch = MIN_TORCH_VERSION
        below = f"{major}.{minor}.{patch - 1}"
        assert not check_availability(torch_version=below, has_sam=True).available

    def test_carries_an_install_hint_for_the_user(self) -> None:
        result = check_availability(torch_version=None, has_sam=False)
        assert "pip install" in result.install_hint
