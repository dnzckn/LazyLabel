"""Shared test setup.

One helper lives here, and it exists because of a legacy behaviour rather than a testing
convenience — which is why it is worth a file of its own with the reason written down.
"""

from __future__ import annotations


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
