"""`python -m lazylabel_inference.doctor [--full] [--dir DIR]`: can the AI tools run here?

DEPLOYABILITY.md R9. `npm run doctor` runs this when the AI tools' environment exists. Each line is
OK, or FAIL with the command that fixes it:

- Python, and PyTorch: its version, the CUDA it was built for, and whether it can use the GPU. The
  answer to "why is every click four seconds" is usually a CPU build on a machine with an NVIDIA
  driver, which nothing else says out loud;
- the driver's own CUDA version, from `nvidia-smi`;
- whether cv2, sam2 and segment_anything import;
- whether the manifest parses, as the service parses it;
- each checkpoint: present, and the right size; `--full` checks every SHA-256 too, which reads
  every byte, gigabytes for SAM 1.

It loads no model, and it only reads: a checkpoint that fails is reported, never moved or deleted.
"""

from __future__ import annotations

import argparse
import importlib
import os
import platform
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, TextIO

from .availability import Accelerator, Availability, check_availability, describe_accelerator
from .fetch import FetchError, load_catalog, model_dir
from .manifest import ManifestError, check_checkpoint, load_manifest

VALIDATED_TORCH = "2.10.0"


@dataclass(frozen=True)
class Finding:
    ok: bool
    what: str
    fix: str | None = None


def _nvidia_smi() -> str | None:
    try:
        result = subprocess.run(["nvidia-smi"], capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return None
    return result.stdout if result.returncode == 0 else None


def driver_cuda(nvidia_smi_output: str | None) -> tuple[int, int] | None:
    """The highest CUDA version the NVIDIA driver supports ("CUDA Version: 13.1"), or None."""
    match = re.search(r"CUDA Version:\s*(\d+)\.(\d+)", nvidia_smi_output or "")
    return None if match is None else (int(match.group(1)), int(match.group(2)))


def check_pytorch(
    *,
    availability: Callable[[], Availability] = check_availability,
    accelerator: Callable[[], Accelerator] = describe_accelerator,
    importer: Callable[[str], Any] = importlib.import_module,
    nvidia_smi: Callable[[], str | None] = _nvidia_smi,
) -> list[Finding]:
    """PyTorch as the service will find it, and the device it will run on."""
    state = availability()
    if state.torch_version is None:
        return [Finding(False, "PyTorch is not installed", "npm run ai:setup")]
    if not state.available and "segment-anything" not in state.reason:
        return [Finding(False, state.reason, "npm run ai:setup")]

    try:
        torch = importer("torch")
    except Exception as exc:  # noqa: BLE001 - a DLL that will not load is the answer here
        return [
            Finding(
                False,
                f"PyTorch {state.torch_version} is installed and does not import: {type(exc).__name__}: {exc}",
                "npm run ai:setup",
            )
        ]
    built_for = getattr(getattr(torch, "version", None), "cuda", None)
    device = accelerator()
    driver = driver_cuda(nvidia_smi())
    driver_says = "no NVIDIA driver" if driver is None else f"the NVIDIA driver supports CUDA {driver[0]}.{driver[1]}"
    build = f"PyTorch {state.torch_version}, " + (f"built for CUDA {built_for}" if built_for else "the CPU build")
    if not state.torch_version.startswith(VALIDATED_TORCH):
        build += f" (the suites ran on {VALIDATED_TORCH})"

    if device.kind == "cuda":
        return [Finding(True, f"{build}, on {device.summary}; {driver_says}")]
    if driver is not None and not built_for:
        # The classic: pip's Windows default, a CPU wheel, on a machine with a GPU.
        fix = "npm run ai:setup" if driver >= (12, 8) else "update the NVIDIA driver to one for CUDA 12.8 or later, then npm run ai:setup"
        return [Finding(False, f"{build}, on a machine where {driver_says}: every click runs on the CPU", fix)]
    if driver is not None:
        return [
            Finding(
                False,
                f"{build}, and CUDA is not available to it; {driver_says}",
                "update the NVIDIA driver to one for CUDA 12.8 or later, or npm run ai:setup cpu",
            )
        ]
    return [Finding(True, f"{build}, on the CPU; {driver_says}")]


def check_imports(importer: Callable[[str], Any] = importlib.import_module) -> list[Finding]:
    """The three packages the service imports on its first request."""
    findings = []
    for module in ("cv2", "sam2", "segment_anything"):
        try:
            loaded = importer(module)
        except Exception as exc:  # noqa: BLE001 - whatever stops the import is the answer
            findings.append(Finding(False, f"{module} does not import: {type(exc).__name__}: {exc}", "npm run ai:setup"))
            continue
        version = getattr(loaded, "__version__", None)
        findings.append(Finding(True, f"{module}{f' {version}' if version else ''} imports"))
    return findings


def check_models(directory: Path, manifest_path: Path, *, full: bool) -> list[Finding]:
    """The manifest, parsed as the service parses it, and every checkpoint it lists."""
    if not manifest_path.exists():
        return [Finding(False, f"there is no model manifest at {manifest_path}", "npm run ai:models sam2.1-large")]
    try:
        entries = load_manifest(manifest_path)
    except ManifestError as exc:
        return [
            Finding(
                False,
                f"the manifest {manifest_path} cannot be read: {exc}",
                "correct it, or move it aside and run npm run ai:models sam2.1-large",
            )
        ]

    try:
        fetchable = {checkpoint.filename: checkpoint.id for checkpoint in load_catalog() if checkpoint.url}
    except FetchError:
        fetchable = {}
    findings = [Finding(True, f"the manifest {manifest_path} lists {len(entries)} model{'s' if len(entries) != 1 else ''}")]
    for entry in entries:
        status = check_checkpoint(entry, directory, verify_hash=full)
        if status.usable:
            findings.append(Finding(True, f"{entry.name}: {entry.filename}, {entry.bytes:,} bytes, SHA-256 verified"))
        elif status.present and not full and status.detail.endswith("hash not checked"):
            findings.append(
                Finding(True, f"{entry.name}: {entry.filename}, {entry.bytes:,} bytes, the right size (--full checks its SHA-256)")
            )
        else:
            if entry.filename not in fetchable:
                fix = f"put the right {entry.filename} in {directory}, or remove its entry from the manifest"
            elif status.present:
                # It is left for a person to move: it may be a file someone put there on purpose.
                fix = f"move {entry.filename} out of {directory}, then npm run ai:models {fetchable[entry.filename]}"
            else:
                fix = f"npm run ai:models {fetchable[entry.filename]}"
            findings.append(Finding(False, f"{entry.name}: {status.detail}", fix))
    return findings


def render(findings: list[Finding]) -> str:
    lines = []
    for each in findings:
        lines.append(f"  {'OK  ' if each.ok else 'FAIL'}  {each.what}")
        if not each.ok and each.fix:
            lines.append(f"        fix: {each.fix}")
    return "\n".join(lines)


def main(argv: list[str] | None = None, *, out: TextIO = sys.stdout) -> int:
    parser = argparse.ArgumentParser(prog="python -m lazylabel_inference.doctor", description=__doc__.splitlines()[0])
    parser.add_argument("--full", action="store_true", help="check every checkpoint's SHA-256 too")
    parser.add_argument("--dir", type=Path, help="the model folder (default: LAZYLABEL_MODEL_DIR, else per user)")
    args = parser.parse_args(argv)

    directory = args.dir.resolve() if args.dir is not None else model_dir()
    named = os.environ.get("LAZYLABEL_MODEL_MANIFEST", "").strip()
    manifest_path = Path(named).resolve() if named else directory / "manifest.json"

    python_ok = sys.version_info >= (3, 12)
    findings = [
        Finding(True, f"Python {platform.python_version()}")
        if python_ok
        else Finding(False, f"Python {platform.python_version()} is older than 3.12", "npm run ai:setup"),
        *check_pytorch(),
        *check_imports(),
        *check_models(directory, manifest_path, full=args.full),
    ]
    print(render(findings), file=out)
    return 0 if all(each.ok for each in findings) else 1


if __name__ == "__main__":
    sys.exit(main())
