"""Recovering the class names from a legacy NPZ, without letting it run code.

The architecture's data-migration step, and the other half of the gap the conversion flow surfaced:
a legacy `.npz` or `_CM.npz` stores its class-alias table as a PICKLED Python dict. Nothing in the
web stack will unpickle one (SEC-01), so the masks load and the names do not -- and Pascal VOC and
CreateML carry names rather than ids, so an export writes "3" where the original said "stop sign".

This is the only component permitted to load pickle, and it is deliberately not permitted to load
much of one.

WHY `allow_pickle=True` IS NOT GOOD ENOUGH. `np.load(..., allow_pickle=True)` runs whatever the
file says to run. A checkpoint-style attack needs no cleverness: `__reduce__` returning
`(os.system, ("...",))` executes on load. A converter exists precisely to be pointed at files whose
provenance nobody is sure of, so it is the last place to trust one.

Instead the payload goes through a pickle.Unpickler whose `find_class` permits exactly the four
names reconstructing a NumPy object array needs, and refuses everything else by raising. That is
not a filter over a blocklist; it is an allow-list of four, and anything a hostile file wants to do
requires a fifth.
"""

from __future__ import annotations

import io
import pickle
import re
import zipfile
from dataclasses import dataclass

# Exactly what unpickling a NumPy object array touches. Nothing here can open a file, spawn a
# process or import a module: `_reconstruct` and `dtype` build arrays, `scalar` builds numbers.
_PERMITTED: frozenset[tuple[str, str]] = frozenset(
    {
        ("numpy.core.multiarray", "_reconstruct"),
        ("numpy", "ndarray"),
        ("numpy", "dtype"),
        ("numpy.core.multiarray", "scalar"),
        # NumPy 2 moved the private module; both spellings appear in files written by different
        # versions, and a converter meets files written by all of them.
        ("numpy._core.multiarray", "_reconstruct"),
        ("numpy._core.multiarray", "scalar"),
    }
)

ALIAS_MEMBER = "class_aliases.npy"
JSON_MEMBER = "class_aliases_json.npy"


class UnsafePickle(Exception):
    """The pickled payload asked for something this converter will not give it."""


class NotConvertible(Exception):
    """The archive holds nothing this converter can or should rewrite."""


class _RestrictedUnpickler(pickle.Unpickler):
    """An unpickler that can rebuild a NumPy object array and do nothing else."""

    def find_class(self, module: str, name: str):  # noqa: ANN201 - pickle's own signature
        if (module, name) in _PERMITTED:
            return super().find_class(module, name)
        raise UnsafePickle(
            f"this file's alias table asks for {module}.{name}, which is not one of the four "
            "names rebuilding a NumPy array needs. It is refused rather than executed."
        )


@dataclass(frozen=True)
class AliasReadResult:
    aliases: dict[int, str]
    """Entries the table held that were not a plain integer-to-string mapping."""
    discarded: int


def read_legacy_aliases(archive: bytes) -> AliasReadResult:
    """Recover the alias table from a legacy NPZ's pickled member.

    Raises NotConvertible when there is no legacy table to read, and UnsafePickle when the payload
    wants anything beyond rebuilding an array.
    """
    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        names = set(zf.namelist())
        if JSON_MEMBER in names:
            raise NotConvertible("this archive already carries a JSON alias table")
        if ALIAS_MEMBER not in names:
            raise NotConvertible("this archive has no class-alias table at all")
        payload = zf.read(ALIAS_MEMBER)

    return _decode(payload)


def _decode(payload: bytes) -> AliasReadResult:
    """Read the .npy wrapper, then the pickle inside it."""
    if not payload.startswith(b"\x93NUMPY"):
        raise NotConvertible("the alias member is not a .npy file")

    major = payload[6]
    # v1 headers carry a 2-byte length, v2 and v3 carry 4.
    length_size = 2 if major == 1 else 4
    header_start = 8 + length_size
    header_length = int.from_bytes(payload[8:header_start], "little")
    header = payload[header_start : header_start + header_length].decode("latin-1")

    if "'descr': '|O'" not in header and '"descr": "|O"' not in header:
        # A plain (non-object) member is already readable without pickle; nothing to convert.
        raise NotConvertible(f"the alias member is not a pickled object array: {header.strip()}")

    body = payload[header_start + header_length :]
    try:
        value = _RestrictedUnpickler(io.BytesIO(body)).load()
    except UnsafePickle:
        raise
    except Exception as exc:  # noqa: BLE001 - any other failure is a damaged file, not a threat
        raise NotConvertible(f"the alias table could not be read: {exc}") from exc

    return _coerce(value)


def _coerce(value: object) -> AliasReadResult:
    """Turn whatever came out of the pickle into an int-to-string mapping.

    The member is a 0-dimensional object array wrapping a dict, so the value arrives as an array
    and has to be unwrapped. Anything that is not a plain mapping of integers to strings is counted
    and dropped rather than coerced: a converter that guesses at a malformed table writes names the
    user never chose.
    """
    if hasattr(value, "item") and getattr(value, "shape", None) == ():
        value = value.item()

    if not isinstance(value, dict):
        raise NotConvertible(f"the alias table is a {type(value).__name__}, not a mapping")

    aliases: dict[int, str] = {}
    discarded = 0
    for key, name in value.items():
        if isinstance(key, bool) or not isinstance(key, int):
            # bool is an int subclass, and True as a class id is a malformed table, not class 1.
            discarded += 1
            continue
        if not isinstance(name, str):
            discarded += 1
            continue
        aliases[int(key)] = name

    return AliasReadResult(aliases=aliases, discarded=discarded)


def encode_json_member(aliases: dict[int, str]) -> bytes:
    """The JSON alias member, in the layout the format library writes and reads.

    A NumPy unicode scalar holding one JSON document, per decision 4. Written under the NEW member
    name: the legacy loader calls `.item()` on `class_aliases` inside a try and `.items()` on the
    result outside it, so a unicode scalar under the old name would raise and take the entire legacy
    load down with it -- losing every segment, not just the names.
    """
    import json

    text = json.dumps({str(key): name for key, name in sorted(aliases.items())})
    codepoints = len(text)
    body = text.encode("utf-32-le")

    header = f"{{'descr': '<U{codepoints}', 'fortran_order': False, 'shape': (), }}"
    # The header is padded so the data starts on a 64-byte boundary, as NumPy writes it.
    padding = 64 - ((10 + len(header) + 1) % 64)
    header = header + " " * padding + "\n"

    return b"\x93NUMPY\x01\x00" + len(header).to_bytes(2, "little") + header.encode("latin-1") + body


def rewrite_archive(archive: bytes, aliases: dict[int, str]) -> bytes:
    """A copy of the archive with the pickled alias table replaced by a JSON one.

    Every other member is copied through byte for byte: the masks are the irreplaceable part, and a
    converter that re-encodes them is a converter that can corrupt them.
    """
    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(archive)) as source:
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as target:
            for item in source.infolist():
                if item.filename == ALIAS_MEMBER:
                    continue  # replaced, not copied
                target.writestr(item, source.read(item.filename))
            target.writestr(JSON_MEMBER, encode_json_member(aliases))

    return out.getvalue()
