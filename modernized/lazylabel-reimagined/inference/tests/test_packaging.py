"""The AI environment is one resolution, recorded, and the same on every machine.

DEPLOYABILITY.md R6. A plain `pip install ".[ai]"` resolved to four different PyTorch builds on four
platforms and never to the validated 2.10.0: CPU-only on Windows, CUDA 13 on Linux. SAM 2 came from
git, and its build pulled a second PyTorch into the isolated build environment just to skip an
extension. So `pyproject.toml` now pins the validated pair, offers PyTorch's own CPU and CUDA 12.8
builds as two extras, installs SAM 2 from a prebuilt wheel in `vendor/`, and `uv.lock` records the
lot. Each property below is what keeps `npm run ai:setup` installing what the suites ran on, and
each is easy to lose in an edit that looks like tidying.
"""

from __future__ import annotations

import hashlib
import re
import tomllib
import zipfile
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1]
REPOSITORY = HERE.parents[2]
WHEEL = HERE / "vendor" / "sam_2-1.0-py3-none-any.whl"
WHEEL_SHA256 = "86ee27153b23fbb3f15ec6a12234b86543102a6ecf182d1f62af2374efd1bb63"
SAM2_COMMIT = "2b90b9f5ceec907a1c18123530e92e794ad901a4"

PYTORCH = {"torch": "==2.10.0", "torchvision": "==0.25.0"}


@pytest.fixture(scope="module")
def project() -> dict:
    return tomllib.loads((HERE / "pyproject.toml").read_text(encoding="utf-8"))


def _pins(requirements: list[str]) -> dict[str, str]:
    """`name==version` requirements by lower-case name; anything else as the whole requirement."""
    pins = {}
    for requirement in requirements:
        match = re.match(r"^([A-Za-z0-9_.-]+)\s*(==[^;\s]+)?", requirement)
        assert match is not None, requirement
        pins[match.group(1).lower()] = match.group(2) or requirement
    return pins


class TestTheValidatedPyTorch:
    def test_every_extra_that_names_pytorch_pins_the_pair_the_suites_passed_on(self, project):
        # A floor let a fresh install pick whatever PyPI had that day. The three extras must move
        # together: `ai` with `cu128` is one install, and a mismatch is an unsatisfiable lock.
        extras = project["project"]["optional-dependencies"]
        for extra in ("ai", "cpu", "cu128"):
            pins = _pins(extras[extra])
            for package, version in PYTORCH.items():
                assert pins.get(package) == version, f"[{extra}] pins {package} to {pins.get(package)}"

    def test_the_two_builds_come_from_pytorchs_own_indexes_and_exclude_each_other(self, project):
        uv = project["tool"]["uv"]
        indexes = {index["name"]: index for index in uv["index"]}
        assert indexes["pytorch-cpu"]["url"] == "https://download.pytorch.org/whl/cpu"
        assert indexes["pytorch-cu128"]["url"] == "https://download.pytorch.org/whl/cu128"
        # Explicit, so nothing else is ever fetched from them.
        assert all(index.get("explicit") is True for index in indexes.values())
        assert uv["conflicts"] == [[{"extra": "cpu"}, {"extra": "cu128"}]]
        for package in PYTORCH:
            assert uv["sources"][package] == [
                {"index": "pytorch-cpu", "extra": "cpu"},
                {"index": "pytorch-cu128", "extra": "cu128"},
            ]

    def test_opencv_is_declared_for_the_service_as_the_headless_build(self, project):
        assert project["project"]["optional-dependencies"]["server"] == ["opencv-python-headless"]


class TestSam2:
    def test_pip_still_installs_it_from_the_pinned_commit(self, project):
        ai = project["project"]["optional-dependencies"]["ai"]
        assert f"SAM-2 @ git+https://github.com/facebookresearch/sam2.git@{SAM2_COMMIT}" in ai

    def test_uv_installs_the_vendored_wheel(self, project):
        assert project["tool"]["uv"]["sources"]["sam-2"] == {"path": "vendor/sam_2-1.0-py3-none-any.whl"}

    def test_the_wheel_is_the_one_recorded(self):
        digest = hashlib.sha256(WHEEL.read_bytes()).hexdigest()
        assert digest == WHEEL_SHA256
        assert WHEEL.stat().st_size < 1024 * 1024
        notice = (REPOSITORY / "NOTICE").read_text(encoding="utf-8")
        assert WHEEL_SHA256 in notice and SAM2_COMMIT in notice

    def test_the_wheel_is_pure_python_and_apache_licensed(self):
        with zipfile.ZipFile(WHEEL) as wheel:
            names = wheel.namelist()
            metadata = wheel.read("sam_2-1.0.dist-info/METADATA").decode("utf-8")
            tags = wheel.read("sam_2-1.0.dist-info/WHEEL").decode("utf-8")
        # No compiled extension: the CUDA one was never built, so nothing here is per-platform.
        assert not [name for name in names if name.endswith((".so", ".pyd", ".dll", ".dylib", ".cu"))]
        assert "Tag: py3-none-any" in tags and "Root-Is-Purelib: true" in tags
        assert {name.split("/")[0] for name in names} == {"sam2", "training", "sam_2-1.0.dist-info"}
        assert "License: Apache 2.0" in metadata
        assert (HERE / "vendor" / "sam2.LICENSE").read_text(encoding="utf-8").lstrip().startswith(
            "Apache License"
        )

    def test_the_lockfile_holds_the_same_wheel(self):
        lock = tomllib.loads((HERE / "uv.lock").read_text(encoding="utf-8"))
        (sam2,) = [package for package in lock["package"] if package["name"] == "sam-2"]
        assert sam2["source"] == {"path": "vendor/sam_2-1.0-py3-none-any.whl"}
        assert sam2["wheels"][0]["hash"] == f"sha256:{WHEEL_SHA256}"


class TestTheLockfile:
    def test_it_locks_the_validated_pytorch_from_each_index(self):
        lock = tomllib.loads((HERE / "uv.lock").read_text(encoding="utf-8"))
        torches = {
            (package["version"], package["source"].get("registry"))
            for package in lock["package"]
            if package["name"] == "torch"
        }
        assert ("2.10.0+cu128", "https://download.pytorch.org/whl/cu128") in torches
        assert ("2.10.0+cpu", "https://download.pytorch.org/whl/cpu") in torches
        # macOS: the CPU index's wheels carry no local version there.
        assert ("2.10.0", "https://download.pytorch.org/whl/cpu") in torches
        assert {version.split("+")[0] for version, _ in torches} == {"2.10.0"}

    def test_it_was_made_from_this_pyproject(self, project):
        # A stale lock is refused by `uv sync --locked`, which is what `npm run ai:setup` runs, so
        # a pyproject edit without `uv lock` fails every user's setup. uv itself checks this
        # exactly (`uv lock --locked`, in CI); this is the part that needs no network.
        lock = tomllib.loads((HERE / "uv.lock").read_text(encoding="utf-8"))
        (me,) = [package for package in lock["package"] if package["name"] == "lazylabel-inference"]
        locked = {
            (requirement["name"], requirement.get("marker"), requirement.get("specifier"))
            for requirement in me["metadata"]["requires-dist"]
        }
        for extra, requirements in project["project"]["optional-dependencies"].items():
            for requirement in requirements:
                name = re.match(r"^([A-Za-z0-9_.-]+)", requirement).group(1).lower().replace("_", "-")
                assert any(
                    locked_name == name and marker == f"extra == '{extra}'" for locked_name, marker, _ in locked
                ), f"{requirement} ([{extra}]) is not in uv.lock: run uv lock"
