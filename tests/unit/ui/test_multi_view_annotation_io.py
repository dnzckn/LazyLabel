"""Multi-view annotation save/load must match single view.

Multi-view used to write NPZ directly and read NPZ directly, ignoring both the
user's export format selection and the loader's format priority chain. An image
annotated as YOLO Detection therefore looked blank in multi-view, and saving
from multi-view produced a file the user had not asked for.
"""

import json
from unittest.mock import MagicMock

import cv2
import numpy as np
import pytest

from lazylabel.core.exporters import ExportContext, ExportFormat, export_all
from lazylabel.core.segment_manager import SegmentManager
from lazylabel.ui.main_window import MainWindow

IMAGE_H, IMAGE_W = 80, 100


def _write_image(tmp_path, name="img.png"):
    path = str(tmp_path / name)
    cv2.imwrite(path, np.zeros((IMAGE_H, IMAGE_W, 3), dtype=np.uint8))
    return path


def _rect_segment(y1, y2, x1, x2, class_id=0):
    mask = np.zeros((IMAGE_H, IMAGE_W), dtype=bool)
    mask[y1:y2, x1:x2] = True
    return {"mask": mask, "type": "Loaded", "vertices": None, "class_id": class_id}


def _mock_viewer():
    viewer = MagicMock()
    pixmap = viewer._pixmap_item.pixmap.return_value
    pixmap.isNull.return_value = False
    pixmap.height.return_value = IMAGE_H
    pixmap.width.return_value = IMAGE_W
    return viewer


@pytest.fixture
def mw(tmp_path):
    """A MainWindow stand-in wired for the two multi-view annotation methods."""
    window = MagicMock()
    window.multi_view_viewers = [_mock_viewer(), _mock_viewer()]
    window.multi_view_segment_managers = [SegmentManager(), SegmentManager()]
    window.multi_view_image_paths = [None, None]
    window.control_panel.get_settings.return_value = {
        "export_formats": {ExportFormat.NPZ},
    }
    return window


def _export_as(image_path, segments, formats, aliases=None):
    """Write annotation files the way a single-view save would."""
    sm = SegmentManager()
    if aliases:
        sm.class_aliases = dict(aliases)
    for seg in segments:
        sm.add_segment(dict(seg))

    class_order = sm.get_unique_class_ids()
    mask_tensor = sm.create_final_mask_tensor((IMAGE_H, IMAGE_W), class_order)
    return export_all(
        set(formats),
        ExportContext(
            image_path=image_path,
            image_size=(IMAGE_H, IMAGE_W),
            class_order=class_order,
            class_labels=[sm.get_class_alias(c) for c in class_order],
            class_aliases=dict(sm.class_aliases),
            mask_tensor=mask_tensor,
            instances=sm.create_instance_contours(
                (IMAGE_H, IMAGE_W), class_order, mask_tensor
            ),
        ),
    )


class TestMultiViewLoad:
    @pytest.mark.parametrize(
        "fmt",
        [
            ExportFormat.NPZ,
            ExportFormat.YOLO_DETECTION,
            ExportFormat.PASCAL_VOC,
            ExportFormat.CREATEML,
            ExportFormat.COCO_JSON,
            ExportFormat.YOLO_SEGMENTATION,
        ],
        ids=lambda f: f.value,
    )
    def test_every_format_loads_into_a_viewer(self, mw, tmp_path, fmt):
        image_path = _write_image(tmp_path)
        _export_as(image_path, [_rect_segment(10, 30, 10, 40)], [fmt], {0: "dog"})

        MainWindow._load_multi_view_annotations(mw, 0, image_path)

        assert len(mw.multi_view_segment_managers[0].segments) == 1

    def test_class_order_is_honoured(self, mw, tmp_path):
        """Channels are packed in class_order, not by class id."""
        image_path = _write_image(tmp_path)
        _export_as(
            image_path,
            [_rect_segment(10, 30, 10, 40, 3), _rect_segment(50, 70, 50, 90, 7)],
            [ExportFormat.NPZ],
        )

        MainWindow._load_multi_view_annotations(mw, 0, image_path)

        loaded = mw.multi_view_segment_managers[0].segments
        assert sorted(s["class_id"] for s in loaded) == [3, 7]

    def test_missing_annotations_leave_the_viewer_empty(self, mw, tmp_path):
        image_path = _write_image(tmp_path)

        MainWindow._load_multi_view_annotations(mw, 0, image_path)

        assert mw.multi_view_segment_managers[0].segments == []

    def test_previous_segments_are_cleared(self, mw, tmp_path):
        image_path = _write_image(tmp_path)
        mw.multi_view_segment_managers[0].add_segment(_rect_segment(0, 5, 0, 5))

        MainWindow._load_multi_view_annotations(mw, 0, image_path)

        assert mw.multi_view_segment_managers[0].segments == []


class TestMultiViewSave:
    def test_selected_export_format_is_written(self, mw, tmp_path):
        image_path = _write_image(tmp_path)
        mw.multi_view_image_paths[0] = image_path
        mw.multi_view_segment_managers[0].add_segment(_rect_segment(10, 30, 10, 40))
        mw.control_panel.get_settings.return_value = {
            "export_formats": {ExportFormat.YOLO_DETECTION}
        }

        MainWindow._save_multi_view_annotations(mw)

        assert (tmp_path / "img.txt").exists()
        assert not (tmp_path / "img.npz").exists()

    def test_format_given_as_strings_is_accepted(self, mw, tmp_path):
        """Settings round-trip through JSON as a list of names."""
        image_path = _write_image(tmp_path)
        mw.multi_view_image_paths[0] = image_path
        mw.multi_view_segment_managers[0].add_segment(_rect_segment(10, 30, 10, 40))
        mw.control_panel.get_settings.return_value = {"export_formats": ["PASCAL_VOC"]}

        MainWindow._save_multi_view_annotations(mw)

        assert (tmp_path / "img.xml").exists()

    def test_npz_keeps_class_order_and_aliases(self, mw, tmp_path):
        """Writing the tensor without class_order renumbers classes on reload."""
        image_path = _write_image(tmp_path)
        mw.multi_view_image_paths[0] = image_path
        sm = mw.multi_view_segment_managers[0]
        sm.class_aliases = {3: "dog"}
        sm.add_segment(_rect_segment(10, 30, 10, 40, 3))

        MainWindow._save_multi_view_annotations(mw)

        with np.load(str(tmp_path / "img.npz"), allow_pickle=True) as data:
            assert data["class_order"].tolist() == [3]
            assert data["class_aliases"].item() == {3: "dog"}

    def test_multiple_objects_of_one_class_stay_separate(self, mw, tmp_path):
        image_path = _write_image(tmp_path)
        mw.multi_view_image_paths[0] = image_path
        sm = mw.multi_view_segment_managers[0]
        sm.add_segment(_rect_segment(10, 30, 10, 40))
        sm.add_segment(_rect_segment(10, 30, 40, 70))
        mw.control_panel.get_settings.return_value = {
            "export_formats": {ExportFormat.CREATEML}
        }

        MainWindow._save_multi_view_annotations(mw)

        data = json.loads((tmp_path / "img_createml.json").read_text())
        assert len(data[0]["annotations"]) == 2

    def test_clearing_all_segments_removes_every_annotation_file(self, mw, tmp_path):
        image_path = _write_image(tmp_path)
        _export_as(
            image_path,
            [_rect_segment(10, 30, 10, 40)],
            [ExportFormat.NPZ, ExportFormat.YOLO_DETECTION, ExportFormat.PASCAL_VOC],
            {0: "dog"},
        )
        mw.multi_view_image_paths[0] = image_path

        MainWindow._save_multi_view_annotations(mw)

        for suffix in (".npz", ".txt", ".xml"):
            assert not (tmp_path / f"img{suffix}").exists(), suffix

    def test_both_viewers_are_saved(self, mw, tmp_path):
        first = _write_image(tmp_path, "a.png")
        second = _write_image(tmp_path, "b.png")
        mw.multi_view_image_paths = [first, second]
        mw.multi_view_segment_managers[0].add_segment(_rect_segment(10, 30, 10, 40))
        mw.multi_view_segment_managers[1].add_segment(_rect_segment(40, 60, 40, 70))

        MainWindow._save_multi_view_annotations(mw)

        assert (tmp_path / "a.npz").exists()
        assert (tmp_path / "b.npz").exists()

    def test_round_trip_through_multi_view(self, mw, tmp_path):
        """Save from one viewer, load into the other, and get the same boxes."""
        image_path = _write_image(tmp_path)
        mw.multi_view_image_paths[0] = image_path
        mw.multi_view_segment_managers[0].add_segment(_rect_segment(10, 30, 10, 40, 2))
        mw.control_panel.get_settings.return_value = {
            "export_formats": {ExportFormat.YOLO_DETECTION}
        }

        MainWindow._save_multi_view_annotations(mw)
        MainWindow._load_multi_view_annotations(mw, 1, image_path)

        loaded = mw.multi_view_segment_managers[1].segments
        assert len(loaded) == 1
        assert loaded[0]["class_id"] == 2
        np.testing.assert_array_equal(
            loaded[0]["mask"], mw.multi_view_segment_managers[0].segments[0]["mask"]
        )
