"""Prove that NumPy reads the TypeScript library's NPZ output and that the arrays match legacy.

Usage (from this directory):
    E:/venv/lazylabel/Scripts/python.exe compare_npz.py <dir of TypeScript output>

Each file in that directory must be named <case id>.npz and is compared with
../goldens/<case id>/image.npz, which the legacy exporter wrote.

Equivalence rules come from MODERNIZATION_BRIEF.md decision 10: NPZ members must be array-identical,
except the class alias table, which is JSON in a unicode scalar rather than a pickle (decision 4).
The alias tables are therefore compared by value, after reading each side in its own encoding.

Exit status is non-zero if anything differs, so this can gate Phase 1's exit criteria.
"""

from __future__ import annotations

import json
import pathlib
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
GOLDENS = HERE.parent / "goldens"


def read_aliases(archive: np.lib.npyio.NpzFile, key: str = "class_aliases") -> dict[int, str]:
    """Read an alias table written either as JSON text (new) or as a pickled dict (legacy)."""
    if key not in archive.files:
        return {}
    value = archive[key]
    if value.dtype == object:  # legacy pickle
        return {int(k): str(v) for k, v in value.item().items()}
    return {int(k): str(v) for k, v in json.loads(str(value)).items()}


def compare(case: str, produced: pathlib.Path, golden: pathlib.Path, keys: tuple[str, ...]) -> list[str]:
    problems: list[str] = []
    # Our own output must never need pickle; that is the point of decision 4.
    with np.load(produced, allow_pickle=False) as ours, np.load(golden, allow_pickle=True) as theirs:
        for key in keys:
            if key not in ours.files:
                problems.append(f"{case}: our archive has no {key!r} member")
                continue
            if key not in theirs.files:
                problems.append(f"{case}: the golden archive has no {key!r} member")
                continue
            a, b = ours[key], theirs[key]
            if a.shape != b.shape:
                problems.append(f"{case}: {key} shape {a.shape} != golden {b.shape}")
            elif not np.array_equal(a, b):
                differing = int(np.count_nonzero(a != b))
                problems.append(f"{case}: {key} differs in {differing} of {a.size} values")
            elif key == "mask" and a.dtype != b.dtype:
                problems.append(f"{case}: mask dtype {a.dtype} != golden {b.dtype}")

        ours_aliases = read_aliases(ours)
        theirs_aliases = read_aliases(theirs)
        if ours_aliases != theirs_aliases:
            problems.append(f"{case}: aliases {ours_aliases} != golden {theirs_aliases}")
    return problems


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    produced_dir = pathlib.Path(sys.argv[1])
    files = sorted(produced_dir.glob("*.npz"))
    if not files:
        sys.exit(f"no .npz files in {produced_dir}; run the emitter test first")

    problems: list[str] = []
    for path in files:
        # "<case>.npz" is the one-hot tensor; "<case>_CM.npz" is the class map.
        is_class_map = path.stem.endswith("_CM")
        case = path.stem[: -len("_CM")] if is_class_map else path.stem
        golden = GOLDENS / case / ("image_CM.npz" if is_class_map else "image.npz")
        keys = ("class_map", "foreground", "class_order") if is_class_map else ("mask", "class_order")
        if not golden.exists():
            problems.append(f"{path.stem}: no golden at {golden}")
            continue
        found = compare(path.stem, path, golden, keys)
        problems.extend(found)
        print(f"{'FAIL' if found else 'ok  '}  {path.stem}")

    if problems:
        print("\n" + "\n".join(problems))
        sys.exit(f"\n{len(problems)} difference(s) across {len(files)} archive(s)")
    print(f"\nall {len(files)} archives match the legacy exports")


if __name__ == "__main__":
    main()
