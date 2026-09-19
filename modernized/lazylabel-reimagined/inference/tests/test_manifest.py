"""RULE-087 and RULE-085: is this checkpoint the one the manifest says it is, and what is it?

Legacy answers the first question with "the number of bytes received equalled Content-Length" and
the second by looking for substrings in the file name. Both are tested here against the exact cases
the rule cards record as failing.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from lazylabel_inference.manifest import (
    ManifestError,
    check_checkpoint,
    parse_manifest,
    sha256_of,
)


def manifest_text(**overrides: object) -> str:
    entry = {
        "name": "SAM 1 huge",
        "family": "sam1",
        "size": "vit_h",
        "filename": "sam_vit_h_4b8939.pth",
        "sha256": "a" * 64,
        "bytes": 2564550879,
    }
    entry.update(overrides)
    return json.dumps({"models": [entry]})


def write_checkpoint(directory: Path, name: str, content: bytes) -> str:
    (directory / name).write_bytes(content)
    return hashlib.sha256(content).hexdigest()


class TestParseManifest:
    def test_reads_a_well_formed_entry(self) -> None:
        entries = parse_manifest(manifest_text())
        assert len(entries) == 1
        assert entries[0].family == "sam1"
        assert entries[0].size == "vit_h"

    def test_sam2_is_video_capable_and_sam1_is_not(self) -> None:
        # Propagation needs a video predictor, which SAM 1 does not have. The manifest is where that
        # is known, rather than inferred from a file name at load time.
        sam1 = parse_manifest(manifest_text())[0]
        sam2 = parse_manifest(manifest_text(family="sam2", size="large"))[0]
        assert not sam1.is_video_capable
        assert sam2.is_video_capable

    @pytest.mark.parametrize(
        ("overrides", "expected"),
        [
            ({"sha256": "abc"}, "64 hex"),
            ({"sha256": "z" * 64}, "64 hex"),
            ({"family": "sam3"}, "expected sam1 or sam2"),
            ({"size": "enormous"}, "not a sam1 size"),
            ({"size": "large"}, "not a sam1 size"),  # a sam2 size on a sam1 entry
            ({"bytes": 0}, "non-positive"),
            ({"bytes": "big"}, "non-positive"),
            ({"filename": "../../etc/passwd"}, "single plain component"),
            ({"filename": "nested/model.pth"}, "single plain component"),
            ({"filename": ".."}, "single plain component"),
        ],
    )
    def test_refuses_an_entry_it_cannot_vouch_for(self, overrides: dict, expected: str) -> None:
        with pytest.raises(ManifestError, match=expected):
            parse_manifest(manifest_text(**overrides))

    def test_refuses_an_entry_with_a_missing_field(self) -> None:
        # An entry with no hash is worse than no entry: it looks verified and verifies nothing.
        document = json.loads(manifest_text())
        del document["models"][0]["sha256"]
        with pytest.raises(ManifestError, match="missing sha256"):
            parse_manifest(json.dumps(document))

    def test_refuses_a_repeated_model_name(self) -> None:
        document = json.loads(manifest_text())
        document["models"].append(document["models"][0])
        with pytest.raises(ManifestError, match="repeats the model name"):
            parse_manifest(json.dumps(document))

    @pytest.mark.parametrize("text", ["", "not json", "[]", '{"models": {}}', "null"])
    def test_refuses_a_document_that_is_not_a_manifest(self, text: str) -> None:
        with pytest.raises(ManifestError):
            parse_manifest(text)

    def test_accepts_an_uppercase_hash_and_normalizes_it(self) -> None:
        entry = parse_manifest(manifest_text(sha256="A" * 64))[0]
        assert entry.sha256 == "a" * 64


class TestCheckCheckpoint:
    def test_verifies_a_matching_file(self, tmp_path: Path) -> None:
        digest = write_checkpoint(tmp_path, "model.pth", b"weights")
        entry = parse_manifest(
            manifest_text(filename="model.pth", sha256=digest, bytes=len(b"weights"))
        )[0]

        status = check_checkpoint(entry, tmp_path)
        assert status.usable and status.verified

    def test_reports_a_missing_file_without_raising(self, tmp_path: Path) -> None:
        entry = parse_manifest(manifest_text(filename="absent.pth"))[0]
        status = check_checkpoint(entry, tmp_path)

        assert not status.present and not status.usable
        assert "absent.pth" in status.detail

    def test_catches_the_truncated_download_legacy_leaves_behind(self, tmp_path: Path) -> None:
        # RULE-087's exact failure: the network drops, the partial file stays, and the next start
        # skips the download and fails to load a truncated checkpoint with no useful message.
        digest = write_checkpoint(tmp_path, "model.pth", b"weights")
        entry = parse_manifest(manifest_text(filename="model.pth", sha256=digest, bytes=9999))[0]

        status = check_checkpoint(entry, tmp_path)
        assert status.present and not status.verified
        assert "partial download" in status.detail.lower()

    def test_catches_a_file_of_the_right_size_with_the_wrong_contents(self, tmp_path: Path) -> None:
        # The case Content-Length cannot see at all: corruption on disk, or a tampered mirror.
        write_checkpoint(tmp_path, "model.pth", b"XXXXXXX")
        entry = parse_manifest(
            manifest_text(filename="model.pth", sha256="b" * 64, bytes=7)
        )[0]

        status = check_checkpoint(entry, tmp_path)
        assert status.present and not status.verified
        assert "hashes to" in status.detail

    def test_skipping_the_hash_does_not_claim_to_have_checked_it(self, tmp_path: Path) -> None:
        digest = write_checkpoint(tmp_path, "model.pth", b"weights")
        entry = parse_manifest(
            manifest_text(filename="model.pth", sha256=digest, bytes=7)
        )[0]

        status = check_checkpoint(entry, tmp_path, verify_hash=False)
        assert status.present and not status.verified
        assert "not checked" in status.detail

    def test_hashes_a_file_larger_than_one_chunk(self, tmp_path: Path) -> None:
        content = bytes(3 * 1024 * 1024)
        digest = write_checkpoint(tmp_path, "big.pth", content)
        assert sha256_of(tmp_path / "big.pth") == digest


class TestFileNameIsNotMeaning:
    """RULE-085: legacy classifies checkpoints by substrings in their file name."""

    @pytest.mark.parametrize(
        ("filename", "family", "size"),
        [
            # Every one of these is a name the card records legacy getting wrong.
            ("my_vit_l.pth", "sam1", "vit_l"),  # contains "_l." -> legacy calls it SAM 2
            ("sam2_hiera_large_tuned.pt", "sam2", "large"),  # contains "_t" -> legacy: tiny config
            ("database_v2.pth", "sam1", "vit_h"),  # contains "base" -> legacy: vit_b
        ],
    )
    def test_the_manifest_decides_what_a_checkpoint_is(
        self, filename: str, family: str, size: str
    ) -> None:
        entry = parse_manifest(manifest_text(filename=filename, family=family, size=size))[0]

        # The name is a place to find bytes, not a statement about what they are.
        assert entry.family == family
        assert entry.size == size

    def test_renaming_a_checkpoint_changes_nothing_about_how_it_is_read(self) -> None:
        first = parse_manifest(manifest_text(filename="anything_at_all.pth"))[0]
        second = parse_manifest(manifest_text(filename="sam2_hiera_tiny.pt"))[0]
        assert (first.family, first.size) == (second.family, second.size)
