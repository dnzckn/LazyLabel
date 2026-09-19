"""Configuration, and what the service refuses to guess."""

from __future__ import annotations

from pathlib import Path

import pytest

from lazylabel_inference.config import ConfigError, load_config


def test_refuses_to_start_without_a_model_directory() -> None:
    # Guessing would mean a service that starts, finds no checkpoints, and reports "no models" --
    # indistinguishable from a correctly configured install whose files are missing.
    with pytest.raises(ConfigError, match="LAZYLABEL_MODEL_DIR"):
        load_config({})

    with pytest.raises(ConfigError, match="LAZYLABEL_MODEL_DIR"):
        load_config({"LAZYLABEL_MODEL_DIR": "   "})


def test_defaults_the_manifest_to_the_model_directory(tmp_path: Path) -> None:
    config = load_config({"LAZYLABEL_MODEL_DIR": str(tmp_path)})
    assert config.manifest_path == (tmp_path / "manifest.json").resolve()


def test_takes_an_explicit_manifest_path(tmp_path: Path) -> None:
    elsewhere = tmp_path / "pinned.json"
    config = load_config(
        {"LAZYLABEL_MODEL_DIR": str(tmp_path), "LAZYLABEL_MODEL_MANIFEST": str(elsewhere)}
    )
    assert config.manifest_path == elsewhere.resolve()


def test_binds_to_loopback_unless_told_otherwise(tmp_path: Path) -> None:
    # Only the API talks to this service, and decision 3 is one trusted user per deployment. A model
    # endpoint on every interface is not something to default into.
    assert load_config({"LAZYLABEL_MODEL_DIR": str(tmp_path)}).host == "127.0.0.1"
    assert (
        load_config(
            {"LAZYLABEL_MODEL_DIR": str(tmp_path), "LAZYLABEL_INFERENCE_HOST": "0.0.0.0"}
        ).host
        == "0.0.0.0"
    )


def test_defaults_the_port_and_validates_an_override(tmp_path: Path) -> None:
    assert load_config({"LAZYLABEL_MODEL_DIR": str(tmp_path)}).port == 8788

    for bad in ["not-a-port", "0", "70000", "-1"]:
        with pytest.raises(ConfigError, match="LAZYLABEL_INFERENCE_PORT"):
            load_config({"LAZYLABEL_MODEL_DIR": str(tmp_path), "LAZYLABEL_INFERENCE_PORT": bad})


def test_resolves_the_model_directory_to_an_absolute_path(tmp_path: Path) -> None:
    config = load_config({"LAZYLABEL_MODEL_DIR": str(tmp_path)})
    assert config.model_dir.is_absolute()
