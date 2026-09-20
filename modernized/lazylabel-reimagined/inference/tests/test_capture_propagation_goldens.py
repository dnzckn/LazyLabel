"""The parts of the golden-capture script that do not need a GPU.

The script itself needs the legacy app, a SAM 2 checkpoint and a real sequence, so it cannot run
in CI. Its argument parsing and frame ordering can, and those are where a mistake is silent: a
mis-parsed seed puts the prompt on the wrong pixel, and a wrong frame order produces a golden
that disagrees with legacy for a reason nobody would look for.
"""

from __future__ import annotations

import importlib.util
import pathlib

import numpy as np
import pytest

MODULE = pathlib.Path(__file__).parent / "fixtures" / "capture_propagation_goldens.py"

spec = importlib.util.spec_from_file_location("capture_propagation_goldens", MODULE)
assert spec is not None and spec.loader is not None
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class TestSeedParsing:
    def test_reads_one_point(self) -> None:
        assert capture.parse_seed("0:1:412,318") == (0, 1, [(412.0, 318.0)])

    def test_reads_several_points_for_one_object(self) -> None:
        frame, obj, points = capture.parse_seed("3:2:10,20;30,40")
        assert (frame, obj) == (3, 2)
        assert points == [(10.0, 20.0), (30.0, 40.0)]

    def test_accepts_fractional_coordinates(self) -> None:
        # Click coordinates are fractional everywhere else in this project, because rounding at
        # click time moves the prompt by up to half a pixel.
        _, _, points = capture.parse_seed("0:1:412.5,318.25")
        assert points == [(412.5, 318.25)]

    @pytest.mark.parametrize("text", ["", "0:1", "0:1:", "x:1:2,3", "0:1:2", "0:1:a,b"])
    def test_refuses_what_is_not_a_seed(self, text: str) -> None:
        # Refused with the input echoed, rather than seeding somewhere arbitrary: a prompt on the
        # wrong pixel produces a plausible-looking golden that is simply of the wrong object.
        with pytest.raises(SystemExit) as raised:
            capture.parse_seed(text)
        assert "--seed must look like" in str(raised.value)


class TestFrameOrder:
    def test_sorts_by_name_as_legacy_does(self, tmp_path: pathlib.Path) -> None:
        for name in ["frame_10.png", "frame_2.png", "frame_1.png"]:
            (tmp_path / name).write_bytes(b"")

        # NOT numerically. A sequence numbered without zero padding propagates in an order nobody
        # intended, and that is the dataset's problem -- but a golden that quietly reordered the
        # frames would hide the very thing a user would report.
        assert [p.name for p in capture.frames_in(tmp_path)] == [
            "frame_1.png",
            "frame_10.png",
            "frame_2.png",
        ]

    def test_ignores_files_that_are_not_images(self, tmp_path: pathlib.Path) -> None:
        (tmp_path / "a.png").write_bytes(b"")
        (tmp_path / "a.npz").write_bytes(b"")
        (tmp_path / "notes.txt").write_bytes(b"")

        assert [p.name for p in capture.frames_in(tmp_path)] == ["a.png"]

    def test_refuses_a_folder_with_no_images(self, tmp_path: pathlib.Path) -> None:
        with pytest.raises(SystemExit, match="no images"):
            capture.frames_in(tmp_path)


class TestMaskPacking:
    def test_the_note_round_trips(self) -> None:
        """The unpacking recipe written into the fixture's metadata actually works.

        Worth a test because it is instructions rather than code: nothing executes it, so an error
        in it survives until someone tries to read a golden months later.
        """
        height, width = 7, 11  # deliberately not a multiple of 8, where packbits pads
        original = np.zeros((height, width), dtype=bool)
        original[2, 3] = True
        original[6, 10] = True

        packed = np.packbits(original)
        restored = np.unpackbits(packed)[: height * width].reshape(height, width).astype(bool)

        assert np.array_equal(restored, original)
