"""Loading a checkpoint: the failures, and the weights-only guarantee.

Everything here runs without a checkpoint. The parts that need one live in
`test_differential_sam2.py`, which skips itself when there is none.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

from lazylabel_inference.backends import SAM2_CONFIGS, load_backend
from lazylabel_inference.manifest import parse_manifest
from lazylabel_inference.prompts import ModelNotLoadedError

HAS_TORCH = importlib.util.find_spec("torch") is not None


def entry(**overrides):
    base = {
        "name": "SAM 2.1 large",
        "family": "sam2",
        "size": "large",
        "filename": "sam2.1_hiera_large.pt",
        "sha256": "a" * 64,
        "bytes": 898083611,
    }
    base.update(overrides)
    return parse_manifest(json.dumps({"models": [base]}))[0]


class TestConfigs:
    def test_every_sam2_size_has_a_config(self) -> None:
        # RULE-085: the size comes from the manifest, and the config comes from the size. Neither
        # comes from the file name, which is what legacy reads and gets wrong.
        assert set(SAM2_CONFIGS) == {"tiny", "small", "base_plus", "large"}

    @pytest.mark.skipif(importlib.util.find_spec("sam2") is None, reason="sam2 is not installed")
    def test_the_configs_exist_in_the_installed_package(self) -> None:
        import sam2

        root = Path(sam2.__file__).parent
        for size, config in SAM2_CONFIGS.items():
            assert (root / config).is_file(), f"{size}: {config} is not in the installed sam2"


class TestLoadFailures:
    def test_refuses_a_family_it_has_no_backend_for(self, tmp_path: Path) -> None:
        with pytest.raises(ModelNotLoadedError, match="SAM 1 arrives later"):
            load_backend(entry(family="sam1", size="vit_h"), tmp_path)

    def test_refuses_a_checkpoint_that_is_not_there(self, tmp_path: Path) -> None:
        # A typed error naming the file, not a None the caller has to interpret.
        with pytest.raises(ModelNotLoadedError, match="is not in"):
            load_backend(entry(), tmp_path)

    def test_the_missing_file_error_names_the_directory(self, tmp_path: Path) -> None:
        with pytest.raises(ModelNotLoadedError) as raised:
            load_backend(entry(), tmp_path)
        assert str(tmp_path) in str(raised.value)


@pytest.mark.skipif(not HAS_TORCH, reason="PyTorch is not installed")
class TestWeightsOnly:
    def test_this_pytorch_refuses_to_execute_code_from_a_checkpoint(self) -> None:
        """Phase 3 exit criterion 3, checked rather than trusted.

        `sam2.build_sam` passes `weights_only=True` explicitly. `segment_anything.build_sam` does
        NOT - it calls plain `torch.load(f)` - and is safe only because PyTorch 2.6 flipped that
        default to True, and RULE-084 puts the floor at 2.7.1. The version minimum is therefore
        doing security work beyond feature availability, and this asserts it still is.
        """
        from lazylabel_inference.backends import assert_weights_only_loading

        assert_weights_only_loading()  # raises if a checkpoint could execute code

    def test_sam2_asks_for_weights_only_explicitly(self) -> None:
        sam2_build = pytest.importorskip("sam2.build_sam")
        import inspect

        source = inspect.getsource(sam2_build)
        # If upstream ever drops this, the guarantee falls back to the torch default alone, and
        # this test is where we find out rather than in an incident.
        assert "weights_only=True" in source
