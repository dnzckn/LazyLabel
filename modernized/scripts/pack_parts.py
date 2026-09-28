"""Split the staged AI bundle into zips GitHub will take: DEPLOYABILITY.md R12.

GitHub refuses a release file of 2 GiB or more, and the bundle with PyTorch's CUDA build is about
twice that. So it goes out in parts. Each part is a complete zip of some of the bundle's files, all
under the same top folder, and the app's launcher unpacks the parts after the first into the folder
the first one made (`api/src/bundle.ts`).

Part 1 holds everything the app and that unpacking need: Node, the app, Python and its standard
library, every file outside site-packages and models/, and every small file. The large files --
PyTorch's libraries and the checkpoints -- go in first-fit, largest first, into the room left,
measured compressed. A bundle that fits in one part is one zip with no part number in its name.

The last entry of every part is `.lazylabel/part-<i>-of-<n>`, so a part whose unpacking stopped
early reads as a part not unpacked. Part 1 also carries `bundle.json`, which names the parts.

    python pack_parts.py --stage <folder> --out <folder> [--limit <bytes>]

The stage folder's name is the bundle's name and each part's top folder. Standard library only: it
runs on the bundle's own Python.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import zipfile
import zlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# GitHub's limit is 2 GiB, 2,147,483,648 bytes, per release file. The room left is for the zip's
# own headers, which are counted per entry below, and for a compressed size measured one way and
# written another.
DEFAULT_LIMIT = 2_000_000_000
# A file this size or larger inside site-packages or models/ may go in any part.
LARGE = 8 * 1024 * 1024
LEVEL = 6
CHUNK = 1 << 20


def compressed_size(path: Path) -> int:
    """What deflate at the zip's level makes of the file, without keeping any of it."""
    packer = zlib.compressobj(LEVEL, zlib.DEFLATED, -15)
    total = 0
    with path.open("rb") as source:
        while block := source.read(CHUNK):
            total += len(packer.compress(block))
    return total + len(packer.flush())


def header_bytes(name: str) -> int:
    """A zip entry's local header, data descriptor and central directory record, with its name twice."""
    return 30 + 16 + 46 + 2 * len(name.encode("utf-8"))


def movable(relative: str, size: int) -> bool:
    parts = relative.split("/")
    in_packages = parts[0] == "python" and "site-packages" in parts
    return (in_packages or parts[0] == "models") and size >= LARGE


def plan(stage: Path, limit: int) -> list[list[str]]:
    files = sorted(
        relative
        for relative in (path.relative_to(stage).as_posix() for path in stage.rglob("*") if path.is_file())
        # Written into part 1 once the parts are known; a copy from an earlier run is not packed.
        if relative != "bundle.json"
    )
    sizes = {relative: (stage / relative).stat().st_size for relative in files}
    fixed = [relative for relative in files if not movable(relative, sizes[relative])]
    large = [relative for relative in files if movable(relative, sizes[relative])]

    with ThreadPoolExecutor(max_workers=os.cpu_count() or 2) as pool:
        measured = dict(zip(files, pool.map(lambda relative: compressed_size(stage / relative), files)))
    cost = {relative: measured[relative] + header_bytes(f"{stage.name}/{relative}") for relative in files}

    parts: list[list[str]] = [list(fixed)]
    room = [limit - sum(cost[relative] for relative in fixed) - 4096]
    if room[0] < 0:
        raise SystemExit(f"part 1's own files come to more than {limit:,} bytes compressed")
    for relative in sorted(large, key=lambda relative: cost[relative], reverse=True):
        if cost[relative] > limit - 4096:
            raise SystemExit(f"{relative} is {cost[relative]:,} bytes compressed, more than one part holds")
        for index, left in enumerate(room):
            if cost[relative] <= left:
                parts[index].append(relative)
                room[index] -= cost[relative]
                break
        else:
            parts.append([relative])
            room.append(limit - 4096 - cost[relative])
    return parts


def part_name(bundle: str, index: int, count: int) -> str:
    return f"{bundle}.zip" if count == 1 else f"{bundle}-{index}of{count}.zip"


def python_path(stage: Path) -> str:
    return "python/python.exe" if (stage / "python" / "python.exe").is_file() else "python/bin/python3"


def write_part(stage: Path, out: Path, files: list[str], index: int, names: list[str], manifest: str | None) -> Path:
    bundle = stage.name
    target = out / names[index - 1]
    target.unlink(missing_ok=True)
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=LEVEL, strict_timestamps=False) as archive:
        for relative in files:
            archive.write(stage / relative, f"{bundle}/{relative}")
        if manifest is not None:
            archive.writestr(f"{bundle}/bundle.json", manifest)
        # Last, so a part unpacked only partly has no marker.
        archive.writestr(
            f"{bundle}/.lazylabel/part-{index}-of-{len(names)}",
            f"{names[index - 1]}\n{len(files)} files\n",
        )
    return target


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while block := source.read(CHUNK):
            digest.update(block)
    return digest.hexdigest()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--stage", type=Path, required=True, help="the staged bundle, named as the bundle is")
    parser.add_argument("--out", type=Path, required=True, help="where the parts and their .sha256 files go")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="the most bytes one part may hold")
    args = parser.parse_args(argv)
    stage = args.stage.resolve()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)

    parts = plan(stage, args.limit)
    names = [part_name(stage.name, index, len(parts)) for index in range(1, len(parts) + 1)]
    manifest = json.dumps(
        {"name": stage.name, "parts": names, "python": python_path(stage), "models": "models"}, indent=2
    ) + "\n"
    (stage / "bundle.json").write_text(manifest, encoding="utf-8")

    with ThreadPoolExecutor(max_workers=len(parts)) as pool:
        written = list(
            pool.map(
                lambda index: write_part(stage, out, parts[index - 1], index, names, manifest if index == 1 else None),
                range(1, len(parts) + 1),
            )
        )

    for path, files in zip(written, parts):
        size = path.stat().st_size
        if size >= 2**31:
            raise SystemExit(f"{path.name} is {size:,} bytes, which GitHub will not take")
        digest = sha256(path)
        path.with_name(f"{path.name}.sha256").write_text(f"{digest}  {path.name}\n", encoding="utf-8")
        print(f"{path}\n  {size / 1024 / 1024:.1f} MB, {len(files)} files, SHA-256 {digest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
