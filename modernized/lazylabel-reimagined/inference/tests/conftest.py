"""Shared test setup.

One helper lives here, and it exists because of a legacy behaviour rather than a testing
convenience — which is why it is worth a file of its own with the reason written down.
"""

from __future__ import annotations

import gc
import importlib.util
import sys

import pytest

# PyTorch before anything that might load Qt. On Windows, PyTorch 2.10 with PyQt6 6.9.2 cannot load
# torch's c10.dll once PyQt6 is already loaded (WinError 1114; measured 2026-09-23 in the Python
# 3.12 venv -- 2.7.1 with 6.9.1 does not mind). The differential suites import legacy, and legacy
# imports Qt, so a module run on its own failed to import torch at all. Only when PyTorch is here:
# the CPU-only CI environment has none, and must not start needing it.
if importlib.util.find_spec("torch") is not None:
    import torch  # noqa: F401


@pytest.fixture(autouse=True, scope="module")
def _release_the_gpu_between_modules():
    """Hand back the GPU memory one test module's models held before the next module loads its own.

    The live suites load SAM 2 large, SAM 1 vit_h, legacy's copies of both, and the embedder, a
    module at a time, and each module's fixtures drop their models when it ends. PyTorch's caching
    allocator keeps the freed blocks anyway. On PyTorch 2.7.1 that happened to fit in a 10 GB card;
    on 2.10 (2026-09-23) it did not: the card filled, the full run took 260 s against 75, and eight
    SAM 1 differentials failed to load legacy's model -- each of which passes run alone.

    Only when PyTorch is already imported, so a suite that never touches it does not start doing so.
    """
    yield
    gc.collect()
    torch = sys.modules.get("torch")
    if torch is not None and torch.cuda.is_available():
        torch.cuda.empty_cache()


def ensure_sam2_hydra() -> None:
    """Restore the Hydra registration that sam2's builders depend on.

    `sam2/__init__.py` calls `initialize_config_module("sam2")` once at import, and every
    `build_sam2_*` helper composes its config against that global registration.

    Legacy's `Sam2Model` calls `GlobalHydra.instance().clear()` and then uses
    `initialize_config_dir` as a CONTEXT MANAGER (`sam2_model.py:692-695`), which clears it again on
    exit. So once anything in the process has constructed a legacy `Sam2Model`, sam2's own builders
    stop working — not for the test that did it, but for every later one, which is why the symptom
    is a failure in a file that never mentions legacy.

    In the desktop app this never showed, because legacy was the only Hydra user in the process. It
    matters here, and it would matter anywhere the two coexist. Calling this before building a
    predictor is the fix; the alternative would be ordering the test files, which hides the cause.
    """
    from hydra import initialize_config_module
    from hydra.core.global_hydra import GlobalHydra

    if not GlobalHydra.instance().is_initialized():
        initialize_config_module("sam2", version_base="1.2")
