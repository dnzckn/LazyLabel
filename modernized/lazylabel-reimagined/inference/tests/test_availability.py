"""RULE-084: whether the AI stack is present and new enough.

The interesting cases are the ones that crash the legacy check. It does

    [int(p) for p in torch.__version__.split("+")[0].split(".")[:3]]

inside a guard that catches only ImportError, so a nightly PyTorch reporting "2.8.0a0" raises
ValueError and stops the application from starting. Every version string below can be tested here
without installing the build that produces it, which is the point of injecting it.
"""

from __future__ import annotations

import importlib.util

import pytest

from lazylabel_inference.availability import (
    MIN_TORCH_VERSION,
    check_availability,
    describe_accelerator,
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
        # DEPLOYABILITY.md R6: the AI stack is installed by one command, not by a pip extra.
        result = check_availability(torch_version=None, has_sam=False)
        assert "npm run ai:setup" in result.install_hint
        assert "pip install" not in result.install_hint

    def test_the_commonest_reason_with_its_hint_is_one_short_line(self) -> None:
        # The web shows the reason as one run of text, and its terse guard allows 60 characters
        # (web/test/terse.ts).
        result = check_availability(torch_version=None, has_sam=False)
        assert len(f"{result.reason} {result.install_hint}") <= 60


class TestAccelerator:
    """Which device inference runs on — a separate question from whether it can run at all."""

    def test_reports_a_named_gpu(self) -> None:
        accelerator = describe_accelerator(cuda=True, name="NVIDIA GeForce RTX 4090")

        assert accelerator.kind == "cuda"
        assert accelerator.summary == "NVIDIA GeForce RTX 4090"

    def test_reports_a_gpu_it_cannot_name(self) -> None:
        # The device is still a GPU even when asking its name failed, and saying "GPU" is better
        # than falling back to "CPU", which would be a wrong answer rather than a vague one.
        assert describe_accelerator(cuda=True, name=None).summary == "GPU"

    def test_reports_the_cpu(self) -> None:
        accelerator = describe_accelerator(cuda=False)

        assert accelerator.kind == "cpu"
        assert accelerator.summary == "CPU"
        assert accelerator.name is None

    @pytest.mark.skipif(importlib.util.find_spec("torch") is None, reason="needs torch")
    def test_reports_unknown_rather_than_failing_when_torch_cannot_be_asked(self, monkeypatch) -> None:
        """A status bar that cannot name the device is a small loss; a health route that dies
        trying to find out is a large one.

        `torch.cuda.is_available()` really does raise on a broken driver install, so this patches
        the actual call rather than injecting a stand-in -- the guarantee is about the LOOKUP path,
        and injecting a value skips exactly the code being claimed safe.
        """
        import torch

        def explode() -> bool:
            raise RuntimeError("the CUDA driver is not loaded")

        monkeypatch.setattr(torch.cuda, "is_available", explode)

        accelerator = describe_accelerator()

        assert accelerator.kind == "unknown"
        assert accelerator.summary == "unknown"

    @pytest.mark.skipif(importlib.util.find_spec("torch") is None, reason="needs torch")
    def test_falls_back_to_GPU_when_only_the_NAME_lookup_fails(self, monkeypatch) -> None:
        import torch

        monkeypatch.setattr(torch.cuda, "is_available", lambda: True)
        monkeypatch.setattr(
            torch.cuda, "get_device_name", lambda _index: (_ for _ in ()).throw(RuntimeError("no"))
        )

        accelerator = describe_accelerator()

        assert accelerator.kind == "cuda"
        assert accelerator.summary == "GPU"

    def test_is_independent_of_whether_the_ai_stack_is_usable(self) -> None:
        # A machine can have a GPU and no PyTorch, or PyTorch and no GPU. Folding these into one
        # answer makes whichever failed unanswerable.
        assert describe_accelerator(cuda=True, name="A100").kind == "cuda"
        assert check_availability(torch_version=None).available is False
