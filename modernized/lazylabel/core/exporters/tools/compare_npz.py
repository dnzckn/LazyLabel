"""Prove that NumPy reads the TypeScript library's NPZ output and that the arrays match legacy.

Usage (from this directory):
    E:/venv/lazylabel/Scripts/python.exe compare_npz.py <dir of TypeScript output>

Each file in that directory must be named <case id>.npz and is compared with
../goldens/<case id>/image.npz, which the legacy exporter wrote.

Equivalence rules come from MODERNIZATION_BRIEF.md decision 10: NPZ members must be array-identical,
except the class alias table. Both sides store it as legacy's pickled `class_aliases` member (the
owner's decision of 2026-09-25), but NumPy pickles it as protocol 4 and the TypeScript library as
protocol 2, so the tables are compared by the names they carry.

Exit status is non-zero if anything differs, so this can gate Phase 1's exit criteria.
"""

from __future__ import annotations

import json
import pathlib
import pickletools
import sys
import zipfile

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
GOLDENS = HERE.parent / "goldens"

# The globals legacy's table needs: NumPy's array reconstruction and nothing else.
ALLOWED_GLOBALS = {"numpy.core.multiarray _reconstruct", "numpy ndarray", "numpy dtype"}


def pickle_globals(path: pathlib.Path) -> set[str]:
    """Every global our alias table's pickle names, read by pickletools, which executes nothing."""
    with zipfile.ZipFile(path) as archive:
        raw = archive.read("class_aliases.npy")
    body = raw[raw.index(b"\n", 10) + 1 :]  # the pickle follows the .npy header's newline
    return {
        str(arg) if op.name == "GLOBAL" else op.name  # STACK_GLOBAL takes its names from the stack
        for op, arg, _ in pickletools.genops(body)
        if op.name in ("GLOBAL", "STACK_GLOBAL")
    }


def read_aliases(path: pathlib.Path) -> dict[int, str]:
    """Read an alias table: legacy's pickled `class_aliases`, or the JSON one written before it."""
    with np.load(path, allow_pickle=True) as archive:
        if "class_aliases" in archive.files:
            return {int(k): str(v) for k, v in archive["class_aliases"].item().items()}
        if "class_aliases_json" in archive.files:
            return {int(k): str(v) for k, v in json.loads(str(archive["class_aliases_json"])).items()}
    return {}


def compare(case: str, produced: pathlib.Path, golden: pathlib.Path, keys: tuple[str, ...]) -> list[str]:
    problems: list[str] = []
    # The arrays never need pickle; only the alias table does, and it is checked separately below.
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

    # Check what our table's pickle would call BEFORE letting NumPy unpickle it.
    unexpected = pickle_globals(produced) - ALLOWED_GLOBALS
    if unexpected:
        problems.append(f"{case}: our alias table names globals it must not: {sorted(unexpected)}")
        return problems

    ours_aliases = read_aliases(produced)
    theirs_aliases = read_aliases(golden)
    if ours_aliases != theirs_aliases:
        problems.append(f"{case}: aliases {ours_aliases} != golden {theirs_aliases}")
    return problems


def legacy_can_read(produced: pathlib.Path, is_class_map: bool, expected_aliases: dict[int, str]) -> list[str]:
    """The desktop app must open what the web app writes, masks AND class names.

    This is the check that caught the alias member name: a NumPy unicode scalar under the legacy
    name `class_aliases` makes FileManager._restore_aliases raise outside its own try, so the whole
    legacy load fails with zero segments and the app quietly falls back to a lower-priority sidecar.
    Since the owner's decision of 2026-09-25 it also checks the names legacy reads back.
    """
    try:
        from lazylabel.core.file_manager import FileManager
        from lazylabel.core.segment_manager import SegmentManager
    except ImportError:
        return []  # legacy not importable here; the array comparison above still ran

    manager = SegmentManager()
    reader = FileManager(manager)
    try:
        if is_class_map:
            with np.load(produced, allow_pickle=False) as archive:
                shape = archive["class_map"].shape
            reader.load_npz_class_map(str(produced), (int(shape[0]), int(shape[1])))
        else:
            reader._load_npz(str(produced))
    except Exception as exc:  # noqa: BLE001 - any raise here is the failure we are testing for
        return [f"{produced.stem}: the legacy loader raised {type(exc).__name__}: {exc}"]
    if not manager.segments:
        return [f"{produced.stem}: the legacy loader read zero segments"]
    if manager.class_aliases != expected_aliases:
        return [f"{produced.stem}: the legacy loader read names {manager.class_aliases}, not {expected_aliases}"]
    return []


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
        if not found:  # only let the legacy loader unpickle a table that passed the globals check
            found += legacy_can_read(path, is_class_map, read_aliases(golden))
        problems.extend(found)
        print(f"{'FAIL' if found else 'ok  '}  {path.stem}")

    if problems:
        print("\n" + "\n".join(problems))
        sys.exit(f"\n{len(problems)} difference(s) across {len(files)} archive(s)")
    print(f"\nall {len(files)} archives match the legacy exports")


if __name__ == "__main__":
    main()
