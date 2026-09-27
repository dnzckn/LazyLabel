"""`python -m lazylabel_inference.doctor`: can the AI tools run here, and if not, what to run.

DEPLOYABILITY.md R9. Every support question about the AI tools so far had one of a handful of
answers -- PyTorch missing, the CPU build on a GPU machine, a driver too old for the build, a
package that will not import, no manifest, a checkpoint missing or truncated -- and each needed an
expert to find. These hold each answer to its line and its fix. PyTorch, the driver and the imports
are stand-ins, so the answers are the same on every machine, CI's included; no model is loaded.
"""

from __future__ import annotations

import hashlib
import io
import json
from types import SimpleNamespace

import pytest

from lazylabel_inference.availability import Accelerator, Availability
from lazylabel_inference.doctor import check_imports, check_models, check_pytorch, driver_cuda, main, render

BANNER = "| NVIDIA-SMI 591.86                 Driver Version: 591.86         CUDA Version: 13.1     |"
OLD_DRIVER = "| NVIDIA-SMI 550.54                 Driver Version: 550.54         CUDA Version: 12.4     |"
RTX = Accelerator("cuda", "NVIDIA GeForce RTX 3080")
CPU = Accelerator("cpu", None)


def pytorch(*, version="2.10.0+cu128", built_for="12.8", device=RTX, smi=BANNER, available=True, reason="ok", torch=None):
    def importer(name):
        if torch is not None:
            raise torch
        return SimpleNamespace(version=SimpleNamespace(cuda=built_for))

    return check_pytorch(
        availability=lambda: Availability(available, version, reason),
        accelerator=lambda: device,
        importer=importer,
        nvidia_smi=lambda: smi,
    )


class TestPyTorch:
    def test_the_validated_build_on_the_gpu_is_ok_and_says_what_it_runs_on(self):
        (found,) = pytorch()
        assert found.ok
        assert found.what == (
            "PyTorch 2.10.0+cu128, built for CUDA 12.8, on NVIDIA GeForce RTX 3080; "
            "the NVIDIA driver supports CUDA 13.1"
        )

    def test_missing_says_to_run_ai_setup(self):
        (found,) = pytorch(version=None, available=False, reason="PyTorch is not installed.")
        assert (found.ok, found.fix) == (False, "npm run ai:setup")

    def test_the_cpu_build_on_a_machine_with_a_gpu_fails_and_says_setup_picks_the_gpu_build(self):
        # pip's Windows default: nothing fails, and every click takes seconds.
        (found,) = pytorch(version="2.10.0+cpu", built_for=None, device=CPU)
        assert not found.ok
        assert "every click runs on the CPU" in found.what
        assert found.fix == "npm run ai:setup"

    def test_a_driver_too_old_for_the_gpu_build_says_to_update_it(self):
        (found,) = pytorch(version="2.10.0+cpu", built_for=None, device=CPU, smi=OLD_DRIVER)
        assert not found.ok and found.fix.startswith("update the NVIDIA driver")

    def test_a_gpu_build_that_cannot_reach_the_gpu_fails(self):
        (found,) = pytorch(device=CPU, smi=OLD_DRIVER)
        assert not found.ok and "CUDA is not available to it" in found.what
        assert found.fix.endswith("npm run ai:setup cpu")

    def test_the_cpu_build_with_no_nvidia_driver_is_ok(self):
        (found,) = pytorch(version="2.10.0", built_for=None, device=CPU, smi=None)
        assert found.ok and found.what.endswith("the CPU build, on the CPU; no NVIDIA driver")

    def test_another_version_that_the_service_accepts_is_ok_and_says_which_the_suites_ran(self):
        (found,) = pytorch(version="2.11.0+cu128")
        assert found.ok and "(the suites ran on 2.10.0)" in found.what

    def test_one_the_service_refuses_fails_with_the_services_reason(self):
        (found,) = pytorch(version="2.5.1", available=False, reason="PyTorch 2.5.1 is older than the required 2.7.1.")
        assert (found.ok, found.what, found.fix) == (False, "PyTorch 2.5.1 is older than the required 2.7.1.", "npm run ai:setup")

    def test_one_that_does_not_import_fails_rather_than_taking_the_doctor_down(self):
        (found,) = pytorch(torch=OSError("[WinError 1114] A DLL initialization routine failed"))
        assert not found.ok and "does not import: OSError" in found.what

    def test_reads_the_drivers_cuda_version(self):
        assert driver_cuda(BANNER) == (13, 1)
        assert driver_cuda(None) is None


class TestImports:
    def test_each_package_the_service_needs_imports_or_says_why_not(self):
        def importer(name):
            if name == "sam2":
                raise ModuleNotFoundError("No module named 'sam2'")
            return SimpleNamespace(__version__="5.0.0") if name == "cv2" else SimpleNamespace()

        found = check_imports(importer)
        assert [(each.ok, each.what) for each in found] == [
            (True, "cv2 5.0.0 imports"),
            (False, "sam2 does not import: ModuleNotFoundError: No module named 'sam2'"),
            (True, "segment_anything imports"),
        ]
        assert found[1].fix == "npm run ai:setup"


def _manifest(directory, *entries):
    (directory / "manifest.json").write_text(json.dumps({"models": list(entries)}), encoding="utf-8")
    return directory / "manifest.json"


def _entry(filename, content, **changed):
    return {
        "name": "SAM 2.1 large",
        "family": "sam2",
        "size": "large",
        "filename": filename,
        "sha256": hashlib.sha256(content).hexdigest(),
        "bytes": len(content),
        **changed,
    }


class TestModels:
    def test_no_manifest_says_which_model_to_fetch(self, tmp_path):
        (found,) = check_models(tmp_path, tmp_path / "manifest.json", full=False)
        assert (found.ok, found.fix) == (False, "npm run ai:models sam2.1-large")

    def test_a_manifest_the_service_cannot_read_fails(self, tmp_path):
        (tmp_path / "manifest.json").write_text("{ not json", encoding="utf-8")
        (found,) = check_models(tmp_path, tmp_path / "manifest.json", full=False)
        assert not found.ok and "cannot be read" in found.what

    def test_a_checkpoint_of_the_right_size_is_ok_and_says_full_checks_its_hash(self, tmp_path):
        (tmp_path / "sam2.1_hiera_large.pt").write_bytes(b"weights")
        manifest = _manifest(tmp_path, _entry("sam2.1_hiera_large.pt", b"weights"))
        listed, checkpoint = check_models(tmp_path, manifest, full=False)
        assert listed.ok and listed.what.endswith("lists 1 model")
        assert checkpoint.ok and checkpoint.what.endswith("7 bytes, the right size (--full checks its SHA-256)")

    def test_full_checks_every_hash(self, tmp_path):
        (tmp_path / "sam2.1_hiera_large.pt").write_bytes(b"weights")
        good = _manifest(tmp_path, _entry("sam2.1_hiera_large.pt", b"weights"))
        assert check_models(tmp_path, good, full=True)[1].what.endswith("SHA-256 verified")

        tampered = _manifest(tmp_path, _entry("sam2.1_hiera_large.pt", b"WEIGHTS"))
        found = check_models(tmp_path, tampered, full=True)[1]
        assert not found.ok and "hashes to" in found.what
        assert check_models(tmp_path, tampered, full=False)[1].ok

    def test_a_missing_checkpoint_says_how_to_fetch_it(self, tmp_path):
        manifest = _manifest(tmp_path, _entry("sam2.1_hiera_large.pt", b"weights"))
        found = check_models(tmp_path, manifest, full=False)[1]
        assert not found.ok and found.fix == "npm run ai:models sam2.1-large"

    def test_a_truncated_one_is_left_for_a_person_to_move(self, tmp_path):
        (tmp_path / "sam2.1_hiera_large.pt").write_bytes(b"weig")
        manifest = _manifest(tmp_path, _entry("sam2.1_hiera_large.pt", b"weights"))
        found = check_models(tmp_path, manifest, full=False)[1]
        assert not found.ok and "partial download" in found.what
        assert found.fix == f"move sam2.1_hiera_large.pt out of {tmp_path}, then npm run ai:models sam2.1-large"
        assert (tmp_path / "sam2.1_hiera_large.pt").read_bytes() == b"weig"

    def test_one_that_cannot_be_fetched_says_to_put_it_there(self, tmp_path):
        manifest = _manifest(tmp_path, _entry("my_tuned.pt", b"weights", name="Tuned"))
        found = check_models(tmp_path, manifest, full=False)[1]
        assert found.fix == f"put the right my_tuned.pt in {tmp_path}, or remove its entry from the manifest"


def test_the_report_marks_each_line_and_puts_the_fix_under_a_failure(tmp_path):
    out = io.StringIO()
    assert main(["--dir", str(tmp_path)], out=out) == 1
    report = out.getvalue()
    assert f"  FAIL  there is no model manifest at {tmp_path / 'manifest.json'}\n        fix: npm run ai:models sam2.1-large" in report
    assert report.splitlines()[0].startswith("  OK    Python 3.")


@pytest.mark.parametrize("ok", [True, False])
def test_render(ok):
    from lazylabel_inference.doctor import Finding

    assert render([Finding(ok, "x", "y")]) == ("  OK    x" if ok else "  FAIL  x\n        fix: y")
