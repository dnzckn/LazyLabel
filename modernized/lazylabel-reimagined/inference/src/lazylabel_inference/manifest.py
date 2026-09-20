"""The model manifest: which checkpoints exist, what they are, and whether they are intact.

This replaces two legacy behaviours that the rule cards record as defects, and it is the reason the
manifest is worth building in Phase 2 rather than alongside the models in Phase 3: it is the part
that decides whether a checkpoint is trustworthy, and it needs no PyTorch to be correct.

RULE-087 -- the legacy integrity check is that the number of bytes received equals Content-Length.
That catches a truncated download and nothing else: not a corrupted file on disk, not a tampered
mirror, not a partial file left behind by an earlier failure. The card also records that a network
error leaves the partial file in place, so the next start skips the download and fails loading a
truncated checkpoint, with no message saying why. Here every checkpoint is pinned by SHA-256 and
nothing is downloaded at runtime at all (SEC-03, SEC-05, SEC-17).

RULE-085 -- the legacy loader decides whether a file is SAM 1 or SAM 2, and which size, by looking
for substrings in its FILE NAME. The card lists what that costs: "my_vit_l.pth" contains "_l." and
is treated as SAM 2 and fails to load; "sam2_hiera_large_tuned.pt" contains "_t" and gets the tiny
config; "database_v2.pth" contains "base" and loads as vit_b. Renaming a file changes how it is
interpreted. Here the manifest states the family and the size, and the file name means nothing.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

# Read in chunks: a SAM checkpoint is gigabytes, and hashing one by reading it whole would need as
# much memory as the model itself.
_CHUNK = 1024 * 1024


class ManifestError(Exception):
    """The manifest cannot be trusted: malformed, or it disagrees with what is on disk."""


@dataclass(frozen=True)
class ModelEntry:
    """One checkpoint, as the manifest declares it."""

    name: str
    family: str  # "sam1", "sam2" or "embedder"
    size: str  # sam1: vit_b/vit_l/vit_h; sam2: tiny/small/base_plus/large; embedder: the net
    filename: str
    sha256: str
    bytes: int

    @property
    def is_video_capable(self) -> bool:
        """Only SAM 2 can propagate through a sequence; SAM 1 has no video predictor."""
        return self.family == "sam2"

    @property
    def is_segmenter(self) -> bool:
        """SAM 1 and SAM 2 answer prompts. An embedder does not; it has no decoder at all."""
        return self.family in ("sam1", "sam2")


_FAMILIES = {
    "sam1": {"vit_b", "vit_l", "vit_h"},
    "sam2": {"tiny", "small", "base_plus", "large"},
    # Find Archetypes needs a feature extractor, not a segmenter. It goes through the SAME manifest
    # rather than a second mechanism, because the guarantee we want from it is identical: a
    # checkpoint that is not listed is not loadable, and one that is listed is hash-checked before
    # it is read. Legacy instead DOWNLOADED these weights from torchvision on first use, which is
    # the exact runtime fetch SEC-03, SEC-05 and SEC-17 rule out.
    "embedder": {"mobilenet_v3_small"},
}


def parse_manifest(text: str) -> list[ModelEntry]:
    """Parse a manifest document, refusing anything it cannot vouch for.

    Every field is required. A manifest entry with a missing or empty hash is worse than no entry at
    all: it looks like a verified checkpoint and verifies nothing.
    """
    try:
        document = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ManifestError(f"the manifest is not valid JSON: {exc}") from exc

    if not isinstance(document, dict) or not isinstance(document.get("models"), list):
        raise ManifestError("the manifest must be an object with a 'models' list")

    entries: list[ModelEntry] = []
    seen: set[str] = set()

    for index, raw in enumerate(document["models"]):
        where = f"models[{index}]"
        if not isinstance(raw, dict):
            raise ManifestError(f"{where} is not an object")

        missing = [k for k in ("name", "family", "size", "filename", "sha256", "bytes") if k not in raw]
        if missing:
            raise ManifestError(f"{where} is missing {', '.join(missing)}")

        family = raw["family"]
        if family not in _FAMILIES:
            # Built from _FAMILIES rather than written out, so adding a family cannot leave the
            # error message describing a world that no longer exists.
            raise ManifestError(
                f"{where} has family {family!r}; expected one of {', '.join(sorted(_FAMILIES))}"
            )
        if raw["size"] not in _FAMILIES[family]:
            raise ManifestError(
                f"{where} has size {raw['size']!r}, which is not a {family} size "
                f"({', '.join(sorted(_FAMILIES[family]))})"
            )

        digest = str(raw["sha256"]).lower()
        if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise ManifestError(f"{where} has a sha256 that is not 64 hex characters")

        if not isinstance(raw["bytes"], int) or raw["bytes"] <= 0:
            raise ManifestError(f"{where} has a non-positive size in bytes")

        name = str(raw["name"])
        if name in seen:
            raise ManifestError(f"{where} repeats the model name {name!r}")
        seen.add(name)

        # The filename is joined to a directory, so it must be one plain component. A manifest is
        # configuration, and configuration that can name ../../etc/passwd is an attack surface.
        filename = str(raw["filename"])
        if "/" in filename or "\\" in filename or filename in ("", ".", ".."):
            raise ManifestError(f"{where} has a filename that is not a single plain component")

        entries.append(
            ModelEntry(
                name=name,
                family=family,
                size=str(raw["size"]),
                filename=filename,
                sha256=digest,
                bytes=int(raw["bytes"]),
            )
        )

    return entries


def sha256_of(path: Path) -> str:
    """The SHA-256 of a file, read in chunks."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(_CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


@dataclass(frozen=True)
class CheckpointStatus:
    """What is known about one declared checkpoint on this machine."""

    entry: ModelEntry
    present: bool
    verified: bool
    detail: str

    @property
    def usable(self) -> bool:
        return self.present and self.verified


def check_checkpoint(entry: ModelEntry, directory: Path, *, verify_hash: bool = True) -> CheckpointStatus:
    """Check one checkpoint against what the manifest says it should be.

    The size is compared first because it is free, and a truncated download -- the exact failure
    RULE-087 leaves in place with no message -- is caught by it without hashing gigabytes.

    ``verify_hash=False`` skips the expensive step for a readiness probe that runs often. It reports
    ``verified=False`` with a detail saying so, rather than claiming a check it did not make.
    """
    path = directory / entry.filename
    if not path.is_file():
        return CheckpointStatus(entry, False, False, f"{entry.filename} is not in {directory}")

    actual_bytes = path.stat().st_size
    if actual_bytes != entry.bytes:
        return CheckpointStatus(
            entry,
            True,
            False,
            f"{entry.filename} is {actual_bytes} bytes; the manifest says {entry.bytes}. "
            "A partial download left in place is the usual cause.",
        )

    if not verify_hash:
        return CheckpointStatus(entry, True, False, "present and the right size; hash not checked")

    actual = sha256_of(path)
    if actual != entry.sha256:
        return CheckpointStatus(
            entry,
            True,
            False,
            f"{entry.filename} hashes to {actual[:12]}..., the manifest expects {entry.sha256[:12]}...",
        )

    return CheckpointStatus(entry, True, True, "verified")


def load_manifest(path: Path) -> list[ModelEntry]:
    """Read and parse a manifest file."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ManifestError(f"the manifest at {path} could not be read: {exc}") from exc
    return parse_manifest(text)
