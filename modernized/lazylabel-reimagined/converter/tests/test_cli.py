"""Converting a folder, and the constraints the architecture puts on doing so.

Also converts the REAL legacy goldens — archives written by running the legacy Python exporters —
because a converter that only handles archives its own tests built is a converter that has never
met a real file.
"""

from __future__ import annotations

import io
import json
import pathlib
import zipfile

import numpy as np
import pytest

from lazylabel_converter.aliases import JSON_MEMBER
from lazylabel_converter.cli import convert_tree, main

from test_aliases import Hostile, legacy_archive

GOLDENS = pathlib.Path(__file__).resolve().parents[3] / "lazylabel" / "core" / "exporters" / "goldens"


def names_in(archive: pathlib.Path) -> dict[str, str]:
    loaded = np.load(archive)  # no allow_pickle: the converted member is plain data
    return json.loads(str(loaded[JSON_MEMBER.removesuffix(".npy")]))


class TestConvertingAFolder:
    def test_converts_every_archive_and_keeps_the_tree(self, tmp_path: pathlib.Path) -> None:
        source = tmp_path / "in"
        (source / "frames").mkdir(parents=True)
        (source / "frames" / "a.npz").write_bytes(legacy_archive({3: "cat"}))
        (source / "b.npz").write_bytes(legacy_archive({7: "dog"}))

        summary = convert_tree(source, tmp_path / "out")

        assert len(summary.converted) == 2
        assert names_in(tmp_path / "out" / "frames" / "a.npz") == {"3": "cat"}
        assert names_in(tmp_path / "out" / "b.npz") == {"7": "dog"}

    def test_never_touches_the_source(self, tmp_path: pathlib.Path) -> None:
        source = tmp_path / "in"
        source.mkdir()
        original = legacy_archive({3: "cat"})
        (source / "a.npz").write_bytes(original)

        convert_tree(source, tmp_path / "out")

        # The architecture's constraint: writes to a NEW path, never in place, so a conversion that
        # goes wrong costs nothing.
        assert (source / "a.npz").read_bytes() == original

    def test_does_not_copy_anything_that_is_not_an_archive(self, tmp_path: pathlib.Path) -> None:
        source = tmp_path / "in"
        source.mkdir()
        (source / "a.npz").write_bytes(legacy_archive({3: "cat"}))
        (source / "photo.png").write_bytes(b"pretend image")

        convert_tree(source, tmp_path / "out")

        # This is a converter, not a backup tool. Quietly duplicating a hundred gigabytes of images
        # would be a surprising thing for it to do.
        assert sorted(p.name for p in (tmp_path / "out").iterdir()) == ["a.npz"]

    def test_separates_the_three_reasons_for_not_converting(self, tmp_path: pathlib.Path) -> None:
        source = tmp_path / "in"
        source.mkdir()
        (source / "legacy.npz").write_bytes(legacy_archive({3: "cat"}))

        no_table = io.BytesIO()
        np.savez(no_table, mask=np.zeros((2, 2, 1), dtype=np.uint8))
        (source / "plain.npz").write_bytes(no_table.getvalue())

        already = tmp_path / "already"
        already.mkdir()
        convert_tree(source, already)
        (source / "done.npz").write_bytes((already / "legacy.npz").read_bytes())

        summary = convert_tree(source, tmp_path / "out")

        assert len(summary.converted) == 1
        assert summary.no_aliases == ["plain.npz"]
        assert summary.already_json == ["done.npz"]

    def test_reports_a_refusal_rather_than_skipping_quietly(self, tmp_path: pathlib.Path) -> None:
        source = tmp_path / "in"
        source.mkdir()
        (source / "hostile.npz").write_bytes(legacy_archive(Hostile()))
        (source / "fine.npz").write_bytes(legacy_archive({3: "cat"}))

        summary = convert_tree(source, tmp_path / "out")

        # The one outcome that must never be quiet. The rest of the folder still converts.
        assert [name for name, _ in summary.refused] == ["hostile.npz"]
        assert len(summary.converted) == 1
        assert not (tmp_path / "out" / "hostile.npz").exists()

    def test_leaves_no_partial_file_behind(self, tmp_path: pathlib.Path) -> None:
        source = tmp_path / "in"
        source.mkdir()
        (source / "a.npz").write_bytes(legacy_archive({3: "cat"}))

        convert_tree(source, tmp_path / "out")

        assert sorted(p.name for p in (tmp_path / "out").iterdir()) == ["a.npz"]


class TestTheCommand:
    def test_refuses_to_write_over_the_source(self, tmp_path: pathlib.Path, capsys) -> None:
        tmp_path.joinpath("in").mkdir()
        assert main([str(tmp_path / "in"), str(tmp_path / "in")]) == 2
        assert "never writes in place" in capsys.readouterr().err

    def test_refuses_a_source_that_is_not_a_folder(self, tmp_path: pathlib.Path) -> None:
        assert main([str(tmp_path / "nope"), str(tmp_path / "out")]) == 2

    def test_exits_non_zero_when_something_was_refused(self, tmp_path: pathlib.Path) -> None:
        source = tmp_path / "in"
        source.mkdir()
        (source / "hostile.npz").write_bytes(legacy_archive(Hostile()))

        # A refusal is not a crash, but a script running this over a dataset has to notice it.
        assert main([str(source), str(tmp_path / "out")]) == 1

    def test_exits_zero_on_a_clean_run(self, tmp_path: pathlib.Path) -> None:
        source = tmp_path / "in"
        source.mkdir()
        (source / "a.npz").write_bytes(legacy_archive({3: "cat"}))

        assert main([str(source), str(tmp_path / "out")]) == 0


@pytest.mark.skipif(not GOLDENS.is_dir(), reason="the Phase 1 goldens are not present")
class TestAgainstRealLegacyFiles:
    """The goldens were produced by running the legacy Python exporters, so these are the real thing."""

    def test_recovers_names_from_every_golden_that_has_them(self, tmp_path: pathlib.Path) -> None:
        source = tmp_path / "in"
        source.mkdir()

        expected: dict[str, list[str]] = {}
        manifest = json.loads((GOLDENS / "manifest.json").read_text(encoding="utf-8"))
        for case_id, case in manifest["cases"].items():
            npz = case["outputs"].get("NPZ")
            if npz is None:
                continue
            (source / f"{case_id}.npz").write_bytes((GOLDENS / case_id / npz["file"]).read_bytes())
            expected[f"{case_id}.npz"] = list(case["classLabels"])

        summary = convert_tree(source, tmp_path / "out")

        assert summary.refused == []
        assert len(summary.converted) == len(expected)

        for name, labels in expected.items():
            recovered = names_in(tmp_path / "out" / name)
            # Legacy writes an alias for every class, so the names should come back in full.
            assert sorted(recovered.values()) == sorted(labels), name

    def test_the_converted_archive_needs_no_pickle_to_read(self, tmp_path: pathlib.Path) -> None:
        manifest = json.loads((GOLDENS / "manifest.json").read_text(encoding="utf-8"))
        case_id, case = next(iter(manifest["cases"].items()))

        source = tmp_path / "in"
        source.mkdir()
        (source / "a.npz").write_bytes((GOLDENS / case_id / case["outputs"]["NPZ"]["file"]).read_bytes())
        convert_tree(source, tmp_path / "out")

        # The point of the whole exercise: the result is plain data, so the web app can read it.
        with zipfile.ZipFile(tmp_path / "out" / "a.npz") as zf:
            assert "class_aliases.npy" not in zf.namelist()
            assert JSON_MEMBER in zf.namelist()
        np.load(tmp_path / "out" / "a.npz")  # would raise if a member still needed pickle
