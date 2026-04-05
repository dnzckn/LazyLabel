"""Unit tests for the pluggable exporter framework and individual exporters.

Tests fall into three tiers:
1. **Smoke tests** — file created, correct extension, correct structure.
2. **Per-format round-trips** — export → load → rebuild tensor → compare to
   original tensor.  For rectangular masks every loadable format must produce
   a pixel-perfect match.
3. **Cross-format equivalence** — export the *same* mask tensor to every
   format that has a loader, load each back, rebuild the tensor, and prove
   they are all identical.  This is the strongest guarantee that format A
   loaded in LazyLabel gives the same annotation as format B.
"""

import json
import os
import tempfile
import xml.etree.ElementTree as ET

import numpy as np
import pytest

from lazylabel.core.exporters import (
    EXPORTERS,
    ExportContext,
    ExportFormat,
    delete_all_outputs,
    export_all,
)
from lazylabel.core.file_manager import FileManager
from lazylabel.core.segment_manager import SegmentManager

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_ctx(
    tmpdir,
    image_name="img.png",
    image_size=(100, 100),
    class_order=None,
    class_labels=None,
    class_aliases=None,
    mask_tensor=None,
):
    """Build an ExportContext with sensible defaults."""
    if class_order is None:
        class_order = [0]
    if class_labels is None:
        class_labels = [str(c) for c in class_order]
    if class_aliases is None:
        class_aliases = dict(zip(class_order, class_labels, strict=True))
    if mask_tensor is None:
        h, w = image_size
        mask_tensor = np.zeros((h, w, len(class_order)), dtype=np.uint8)
        mask_tensor[20:40, 20:40, 0] = 1

    return ExportContext(
        image_path=os.path.join(tmpdir, image_name),
        image_size=image_size,
        class_order=class_order,
        class_labels=class_labels,
        class_aliases=class_aliases,
        mask_tensor=mask_tensor,
    )


def _rect_mask(h, w, y1, y2, x1, x2):
    """Create a rectangular boolean mask."""
    mask = np.zeros((h, w), dtype=np.uint8)
    mask[y1:y2, x1:x2] = 1
    return mask


def _make_fm(aliases=None):
    sm = SegmentManager()
    if aliases:
        sm.class_aliases = dict(aliases)
    return FileManager(sm)


def _rebuild_tensor(fm, image_size):
    """Rebuild a mask tensor from loaded segments, matching exporter output."""
    class_order = fm.segment_manager.get_unique_class_ids()
    if not class_order:
        return np.zeros((*image_size, 0), dtype=np.uint8)
    return fm.segment_manager.create_final_mask_tensor(image_size, class_order)


def _load_via_format(image_path, image_size, fmt, aliases=None):
    """Export was already written — load back through the appropriate loader
    and return the rebuilt mask tensor."""
    base = os.path.splitext(image_path)[0]
    fm = _make_fm(aliases=aliases)

    if fmt == ExportFormat.NPZ:
        fm.load_existing_mask(image_path)
    elif fmt == ExportFormat.YOLO_DETECTION:
        fm.load_bb_txt(base + ".txt", image_size)
    elif fmt == ExportFormat.YOLO_SEGMENTATION:
        fm.load_yolo_seg_txt(base + "_seg.txt", image_size)
    elif fmt == ExportFormat.COCO_JSON:
        fm.load_coco_json(base + "_coco.json", image_size)
    elif fmt == ExportFormat.PASCAL_VOC:
        fm.load_pascal_voc_xml(base + ".xml", image_size)
    elif fmt == ExportFormat.CREATEML:
        fm.load_createml_json(base + "_createml.json", image_size)
    else:
        raise ValueError(f"No loader for {fmt}")

    return _rebuild_tensor(fm, image_size)


# Formats that have both an exporter AND a loader
LOADABLE_FORMATS = {
    ExportFormat.NPZ,
    ExportFormat.YOLO_DETECTION,
    ExportFormat.YOLO_SEGMENTATION,
    ExportFormat.COCO_JSON,
    ExportFormat.PASCAL_VOC,
    ExportFormat.CREATEML,
}


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class TestRegistry:
    def test_all_formats_registered(self):
        for fmt in ExportFormat:
            assert fmt in EXPORTERS, f"{fmt} not registered"

    def test_all_formats_are_loadable(self):
        """Every ExportFormat except write-only formats must have a loader."""
        write_only = {ExportFormat.NPZ_CLASS_MAP}
        assert set(ExportFormat) - write_only == LOADABLE_FORMATS, (
            f"Formats without loaders: {set(ExportFormat) - write_only - LOADABLE_FORMATS}"
        )


# ---------------------------------------------------------------------------
# NPZ exporter — smoke + pixel-perfect round-trip
# ---------------------------------------------------------------------------


class TestNpzExporter:
    @pytest.fixture
    def tmpdir(self):
        with tempfile.TemporaryDirectory() as d:
            yield d

    def test_creates_npz_file(self, tmpdir):
        ctx = _make_ctx(tmpdir)
        path = export_all({ExportFormat.NPZ}, ctx)
        assert len(path) == 1
        assert path[0].endswith(".npz")
        assert os.path.exists(path[0])

    def test_npz_content(self, tmpdir):
        ctx = _make_ctx(tmpdir)
        export_all({ExportFormat.NPZ}, ctx)
        npz_path = os.path.splitext(ctx.image_path)[0] + ".npz"
        with np.load(npz_path) as data:
            assert "mask" in data
            np.testing.assert_array_equal(data["mask"], ctx.mask_tensor)

    def test_empty_tensor_still_saves(self, tmpdir):
        ctx = _make_ctx(tmpdir, mask_tensor=np.zeros((10, 10, 1), dtype=np.uint8))
        paths = export_all({ExportFormat.NPZ}, ctx)
        assert len(paths) == 1

    def test_delete_output(self, tmpdir):
        ctx = _make_ctx(tmpdir)
        export_all({ExportFormat.NPZ}, ctx)
        deleted = delete_all_outputs(ctx.image_path)
        assert any(p.endswith(".npz") for p in deleted)

    def test_roundtrip_pixel_perfect(self, tmpdir):
        """NPZ is lossless — tensor out == tensor in."""
        ctx = _make_ctx(tmpdir)
        export_all({ExportFormat.NPZ}, ctx)
        loaded = _load_via_format(ctx.image_path, ctx.image_size, ExportFormat.NPZ)
        np.testing.assert_array_equal(loaded, ctx.mask_tensor)


# ---------------------------------------------------------------------------
# NPZ Class Map exporter — smoke + content verification
# ---------------------------------------------------------------------------


class TestNpzClassMapExporter:
    @pytest.fixture
    def tmpdir(self):
        with tempfile.TemporaryDirectory() as d:
            yield d

    def test_creates_cm_npz_file(self, tmpdir):
        ctx = _make_ctx(tmpdir)
        paths = export_all({ExportFormat.NPZ_CLASS_MAP}, ctx)
        assert len(paths) == 1
        assert paths[0].endswith("_CM.npz")
        assert os.path.exists(paths[0])

    def test_cm_content(self, tmpdir):
        ctx = _make_ctx(
            tmpdir,
            class_order=[5],
            class_labels=["cat"],
            class_aliases={5: "cat"},
        )
        export_all({ExportFormat.NPZ_CLASS_MAP}, ctx)
        cm_path = os.path.splitext(ctx.image_path)[0] + "_CM.npz"
        with np.load(cm_path, allow_pickle=True) as data:
            assert "class_map" in data
            class_map = data["class_map"]
            assert class_map.shape == (100, 100)
            # Active region should have class ID 5
            assert np.all(class_map[20:40, 20:40] == 5)
            # Background should be 0
            assert class_map[0, 0] == 0

    def test_empty_tensor_skipped(self, tmpdir):
        empty = np.zeros((10, 10, 1), dtype=np.uint8)
        ctx = _make_ctx(tmpdir, mask_tensor=empty)
        paths = export_all({ExportFormat.NPZ_CLASS_MAP}, ctx)
        assert len(paths) == 0

    def test_delete_output(self, tmpdir):
        ctx = _make_ctx(tmpdir)
        export_all({ExportFormat.NPZ_CLASS_MAP}, ctx)
        deleted = delete_all_outputs(ctx.image_path)
        assert any(p.endswith("_CM.npz") for p in deleted)

    def test_background_pixels_are_zero(self, tmpdir):
        h, w = 50, 50
        mask = np.zeros((h, w, 1), dtype=np.uint8)
        mask[10:20, 10:20, 0] = 1
        ctx = _make_ctx(tmpdir, image_size=(h, w), mask_tensor=mask)
        export_all({ExportFormat.NPZ_CLASS_MAP}, ctx)
        cm_path = os.path.splitext(ctx.image_path)[0] + "_CM.npz"
        with np.load(cm_path, allow_pickle=True) as data:
            class_map = data["class_map"]
            # Everything outside the active region is 0
            bg_mask = np.ones((h, w), dtype=bool)
            bg_mask[10:20, 10:20] = False
            assert np.all(class_map[bg_mask] == 0)

    def test_overlap_lowest_channel_wins(self, tmpdir):
        """When multiple channels overlap, the lowest channel index wins."""
        h, w = 50, 50
        mask = np.zeros((h, w, 2), dtype=np.uint8)
        mask[10:30, 10:30, 0] = 1  # class 3
        mask[15:35, 15:35, 1] = 1  # class 7
        ctx = _make_ctx(
            tmpdir,
            image_size=(h, w),
            class_order=[3, 7],
            class_labels=["a", "b"],
            class_aliases={3: "a", 7: "b"},
            mask_tensor=mask,
        )
        export_all({ExportFormat.NPZ_CLASS_MAP}, ctx)
        cm_path = os.path.splitext(ctx.image_path)[0] + "_CM.npz"
        with np.load(cm_path, allow_pickle=True) as data:
            class_map = data["class_map"]
            # Overlap region [15:30, 15:30] should be class 3 (lowest channel)
            assert np.all(class_map[15:30, 15:30] == 3)
            # Class 7 only region
            assert np.all(class_map[30:35, 15:35] == 7)


# ---------------------------------------------------------------------------
# YOLO Detection exporter — smoke + pixel-perfect round-trip (rectangles)
# ---------------------------------------------------------------------------


class TestYoloDetectionExporter:
    @pytest.fixture
    def tmpdir(self):
        with tempfile.TemporaryDirectory() as d:
            yield d

    def test_creates_txt_file(self, tmpdir):
        ctx = _make_ctx(tmpdir, class_labels=["cat"])
        paths = export_all({ExportFormat.YOLO_DETECTION}, ctx)
        assert len(paths) == 1
        assert paths[0].endswith(".txt")

    def test_content_format(self, tmpdir):
        ctx = _make_ctx(tmpdir, class_labels=["cat"], class_aliases={0: "cat"})
        export_all({ExportFormat.YOLO_DETECTION}, ctx)
        txt_path = os.path.splitext(ctx.image_path)[0] + ".txt"
        with open(txt_path) as f:
            lines = f.read().strip().split("\n")
        parts = lines[0].split()
        assert parts[0] == "0"  # integer index, not class name
        assert len(parts) == 5

    def test_class_id_preserved_in_txt(self, tmpdir):
        """Original class IDs are written to the .txt, not remapped indices."""
        ctx = _make_ctx(
            tmpdir,
            class_order=[3, 7],
            class_labels=["cat", "dog"],
            class_aliases={3: "cat", 7: "dog"},
            mask_tensor=np.stack(
                [
                    _rect_mask(100, 100, 10, 30, 10, 30),
                    _rect_mask(100, 100, 50, 70, 50, 70),
                ],
                axis=-1,
            ),
        )
        export_all({ExportFormat.YOLO_DETECTION}, ctx)
        txt_path = os.path.splitext(ctx.image_path)[0] + ".txt"
        with open(txt_path) as f:
            ids = {line.split()[0] for line in f}
        assert ids == {"3", "7"}

    def test_empty_mask_skipped(self, tmpdir):
        empty = np.zeros((10, 10, 1), dtype=np.uint8)
        ctx = _make_ctx(tmpdir, mask_tensor=empty)
        paths = export_all({ExportFormat.YOLO_DETECTION}, ctx)
        assert len(paths) == 0

    def test_roundtrip_pixel_perfect_rectangle(self, tmpdir):
        """YOLO det bbox round-trip is exact for rectangles."""
        ctx = _make_ctx(
            tmpdir,
            class_labels=["0"],
            class_aliases={0: "0"},
        )
        export_all({ExportFormat.YOLO_DETECTION}, ctx)
        loaded = _load_via_format(
            ctx.image_path,
            ctx.image_size,
            ExportFormat.YOLO_DETECTION,
            aliases={0: "0"},
        )
        np.testing.assert_array_equal(loaded, ctx.mask_tensor)


# ---------------------------------------------------------------------------
# YOLO Segmentation exporter — smoke + pixel-perfect round-trip (rectangles)
# ---------------------------------------------------------------------------


class TestYoloSegmentationExporter:
    @pytest.fixture
    def tmpdir(self):
        with tempfile.TemporaryDirectory() as d:
            yield d

    def test_creates_seg_txt(self, tmpdir):
        ctx = _make_ctx(tmpdir, class_labels=["dog"])
        paths = export_all({ExportFormat.YOLO_SEGMENTATION}, ctx)
        assert len(paths) == 1
        assert paths[0].endswith("_seg.txt")

    def test_content_has_polygon(self, tmpdir):
        ctx = _make_ctx(tmpdir, class_labels=["dog"], class_aliases={0: "dog"})
        export_all({ExportFormat.YOLO_SEGMENTATION}, ctx)
        seg_path = os.path.splitext(ctx.image_path)[0] + "_seg.txt"
        with open(seg_path) as f:
            lines = f.read().strip().split("\n")
        parts = lines[0].split()
        assert parts[0] == "0"  # integer index, not class name
        # label + at least 3 xy pairs = 7 tokens minimum
        assert len(parts) >= 7

    def test_roundtrip_pixel_perfect_rectangle(self, tmpdir):
        """YOLO seg polygon round-trip is exact for rectangles."""
        ctx = _make_ctx(
            tmpdir,
            class_labels=["0"],
            class_aliases={0: "0"},
        )
        export_all({ExportFormat.YOLO_SEGMENTATION}, ctx)
        loaded = _load_via_format(
            ctx.image_path,
            ctx.image_size,
            ExportFormat.YOLO_SEGMENTATION,
            aliases={0: "0"},
        )
        np.testing.assert_array_equal(loaded, ctx.mask_tensor)

    def test_seg_preferred_over_det_in_fallback(self, tmpdir):
        """When both _seg.txt and .txt exist, loading prefers segmentation."""
        ctx = _make_ctx(tmpdir, class_labels=["dog"], class_aliases={0: "dog"})
        export_all({ExportFormat.YOLO_DETECTION, ExportFormat.YOLO_SEGMENTATION}, ctx)

        fm = _make_fm(aliases={0: "dog"})
        fm.load_existing_mask(ctx.image_path, image_size=ctx.image_size)
        segs = fm.segment_manager.segments
        assert len(segs) >= 1
        assert segs[0].get("vertices") is not None


# ---------------------------------------------------------------------------
# COCO JSON exporter — smoke + pixel-perfect round-trip (rectangles)
# ---------------------------------------------------------------------------


class TestCocoExporter:
    @pytest.fixture
    def tmpdir(self):
        with tempfile.TemporaryDirectory() as d:
            yield d

    def test_creates_coco_json(self, tmpdir):
        ctx = _make_ctx(tmpdir, class_labels=["person"])
        paths = export_all({ExportFormat.COCO_JSON}, ctx)
        assert len(paths) == 1
        assert paths[0].endswith("_coco.json")

    def test_coco_structure(self, tmpdir):
        ctx = _make_ctx(tmpdir, class_labels=["person"], class_aliases={0: "person"})
        export_all({ExportFormat.COCO_JSON}, ctx)
        coco_path = os.path.splitext(ctx.image_path)[0] + "_coco.json"
        with open(coco_path) as f:
            data = json.load(f)
        assert "images" in data
        assert "annotations" in data
        assert "categories" in data
        assert data["images"][0]["file_name"] == "img.png"
        ann = data["annotations"][0]
        assert "bbox" in ann
        assert "segmentation" in ann
        assert "area" in ann

    def test_supercategory_dot_notation(self, tmpdir):
        ctx = _make_ctx(
            tmpdir,
            class_labels=["dog"],
            class_aliases={0: "dog.animal"},
        )
        export_all({ExportFormat.COCO_JSON}, ctx)
        coco_path = os.path.splitext(ctx.image_path)[0] + "_coco.json"
        with open(coco_path) as f:
            data = json.load(f)
        cat = data["categories"][0]
        assert cat["name"] == "dog"
        assert cat["supercategory"] == "animal"

    def test_roundtrip_pixel_perfect_rectangle(self, tmpdir):
        """COCO polygon round-trip is exact for rectangles."""
        ctx = _make_ctx(
            tmpdir,
            class_labels=["0"],
            class_aliases={0: "0"},
        )
        export_all({ExportFormat.COCO_JSON}, ctx)
        loaded = _load_via_format(
            ctx.image_path,
            ctx.image_size,
            ExportFormat.COCO_JSON,
        )
        np.testing.assert_array_equal(loaded, ctx.mask_tensor)

    def test_empty_mask_skipped(self, tmpdir):
        empty = np.zeros((10, 10, 1), dtype=np.uint8)
        ctx = _make_ctx(tmpdir, mask_tensor=empty)
        paths = export_all({ExportFormat.COCO_JSON}, ctx)
        assert len(paths) == 0


# ---------------------------------------------------------------------------
# Pascal VOC exporter — smoke only (no loader — write-only format)
# ---------------------------------------------------------------------------


class TestPascalVocExporter:
    @pytest.fixture
    def tmpdir(self):
        with tempfile.TemporaryDirectory() as d:
            yield d

    def test_creates_xml(self, tmpdir):
        ctx = _make_ctx(tmpdir, class_labels=["car"])
        paths = export_all({ExportFormat.PASCAL_VOC}, ctx)
        assert len(paths) == 1
        assert paths[0].endswith(".xml")

    def test_xml_structure(self, tmpdir):
        ctx = _make_ctx(tmpdir, class_labels=["car"])
        export_all({ExportFormat.PASCAL_VOC}, ctx)
        xml_path = os.path.splitext(ctx.image_path)[0] + ".xml"
        tree = ET.parse(xml_path)
        root = tree.getroot()
        assert root.tag == "annotation"
        assert root.find("filename").text == "img.png"
        obj = root.find("object")
        assert obj is not None
        assert obj.find("name").text == "car"
        bbox = obj.find("bndbox")
        assert bbox is not None
        assert int(bbox.find("xmin").text) >= 0

    def test_empty_mask_skipped(self, tmpdir):
        empty = np.zeros((10, 10, 1), dtype=np.uint8)
        ctx = _make_ctx(tmpdir, mask_tensor=empty)
        paths = export_all({ExportFormat.PASCAL_VOC}, ctx)
        assert len(paths) == 0


# ---------------------------------------------------------------------------
# CreateML exporter — smoke only (no loader — write-only format)
# ---------------------------------------------------------------------------


class TestCreateMlExporter:
    @pytest.fixture
    def tmpdir(self):
        with tempfile.TemporaryDirectory() as d:
            yield d

    def test_creates_createml_json(self, tmpdir):
        ctx = _make_ctx(tmpdir, class_labels=["tree"])
        paths = export_all({ExportFormat.CREATEML}, ctx)
        assert len(paths) == 1
        assert paths[0].endswith("_createml.json")

    def test_createml_structure(self, tmpdir):
        ctx = _make_ctx(tmpdir, class_labels=["tree"])
        export_all({ExportFormat.CREATEML}, ctx)
        cml_path = os.path.splitext(ctx.image_path)[0] + "_createml.json"
        with open(cml_path) as f:
            data = json.load(f)
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["image"] == "img.png"
        ann = data[0]["annotations"][0]
        assert ann["label"] == "tree"
        coords = ann["coordinates"]
        assert all(k in coords for k in ("x", "y", "width", "height"))

    def test_empty_mask_skipped(self, tmpdir):
        empty = np.zeros((10, 10, 1), dtype=np.uint8)
        ctx = _make_ctx(tmpdir, mask_tensor=empty)
        paths = export_all({ExportFormat.CREATEML}, ctx)
        assert len(paths) == 0


# ---------------------------------------------------------------------------
# Multi-format simultaneous export
# ---------------------------------------------------------------------------


class TestMultiFormatExport:
    @pytest.fixture
    def tmpdir(self):
        with tempfile.TemporaryDirectory() as d:
            yield d

    def test_all_formats_at_once(self, tmpdir):
        ctx = _make_ctx(tmpdir, class_labels=["obj"], class_aliases={0: "obj"})
        paths = export_all(set(ExportFormat), ctx)
        assert len(paths) == 7

    def test_delete_all_outputs(self, tmpdir):
        ctx = _make_ctx(tmpdir, class_labels=["obj"], class_aliases={0: "obj"})
        export_all(set(ExportFormat), ctx)
        deleted = delete_all_outputs(ctx.image_path)
        assert len(deleted) == 7
        for p in deleted:
            assert not os.path.exists(p)

    def test_multiple_classes(self, tmpdir):
        h, w = 100, 100
        mask = np.zeros((h, w, 2), dtype=np.uint8)
        mask[10:30, 10:30, 0] = 1
        mask[60:80, 60:80, 1] = 1
        ctx = _make_ctx(
            tmpdir,
            class_order=[0, 1],
            class_labels=["cat", "dog"],
            class_aliases={0: "cat", 1: "dog"},
            mask_tensor=mask,
        )
        paths = export_all(set(ExportFormat), ctx)
        assert len(paths) == 7

        coco_path = os.path.splitext(ctx.image_path)[0] + "_coco.json"
        with open(coco_path) as f:
            data = json.load(f)
        assert len(data["annotations"]) == 2
        assert len(data["categories"]) == 2


# ===========================================================================
# Cross-format equivalence — the real proof
#
# For rectangular masks every loadable format (NPZ, YOLO Det, YOLO Seg, COCO)
# must reconstruct the *exact same* mask tensor.  This is the same methodology
# as TestNpzTxtCrossValidation in test_file_manager.py, extended to all new
# formats.
# ===========================================================================


class TestCrossFormatEquivalence:
    """Export the same mask tensor to ALL loadable formats, load each back,
    rebuild the tensor, and assert they are all pixel-identical."""

    @pytest.fixture
    def tmpdir(self):
        with tempfile.TemporaryDirectory() as d:
            yield d

    def _export_load_rebuild(
        self, tmpdir, image_size, mask_tensor, class_order, class_labels, aliases
    ):
        """Export to all loadable formats, load each back, return dict of tensors.

        Only formats that actually produced output are loaded.  (Tiny images
        may not produce valid polygons for YOLO Seg / COCO.)
        """
        ctx = _make_ctx(
            tmpdir,
            image_size=image_size,
            class_order=class_order,
            class_labels=class_labels,
            class_aliases=aliases,
            mask_tensor=mask_tensor,
        )
        written_paths = export_all(LOADABLE_FORMATS, ctx)
        written_set = set(written_paths)

        tensors = {}
        for fmt in LOADABLE_FORMATS:
            exporter = EXPORTERS[fmt]
            expected_path = exporter.get_output_path(ctx.image_path)
            if expected_path not in written_set:
                continue  # format skipped (e.g. no valid polygons for tiny image)
            tensors[fmt] = _load_via_format(
                ctx.image_path,
                image_size,
                fmt,
                aliases=aliases,
            )
        return tensors

    def _assert_all_equal(self, tensors, min_formats=2):
        """Assert every tensor in the dict is identical to every other.

        Requires at least *min_formats* to have produced output so the
        comparison is meaningful.
        """
        assert len(tensors) >= min_formats, (
            f"Only {len(tensors)} format(s) produced output, need >= {min_formats}"
        )
        items = list(tensors.items())
        reference_fmt, reference_tensor = items[0]
        for fmt, tensor in items[1:]:
            np.testing.assert_array_equal(
                tensor,
                reference_tensor,
                err_msg=f"{fmt.value} tensor differs from {reference_fmt.value}",
            )

    # --- Single rectangle ---

    def test_single_rect_all_formats_match(self, tmpdir):
        """One 20x20 rectangle: NPZ == YOLO Det == YOLO Seg == COCO."""
        image_size = (100, 100)
        mask = np.zeros((100, 100, 1), dtype=np.uint8)
        mask[20:40, 20:40, 0] = 1
        tensors = self._export_load_rebuild(
            tmpdir,
            image_size,
            mask,
            class_order=[0],
            class_labels=["0"],
            aliases={0: "0"},
        )
        self._assert_all_equal(tensors)

    # --- Multiple classes, non-overlapping ---

    def test_two_classes_non_overlapping(self, tmpdir):
        """Two non-overlapping rectangles in different classes."""
        image_size = (200, 200)
        mask = np.zeros((200, 200, 2), dtype=np.uint8)
        mask[10:50, 10:50, 0] = 1
        mask[100:150, 100:150, 1] = 1
        tensors = self._export_load_rebuild(
            tmpdir,
            image_size,
            mask,
            class_order=[0, 1],
            class_labels=["0", "1"],
            aliases={0: "0", 1: "1"},
        )
        self._assert_all_equal(tensors)

    # --- Same class, two separate boxes ---

    def test_same_class_multiple_boxes(self, tmpdir):
        """Two separate boxes sharing a class: all formats must agree."""
        image_size = (200, 200)
        mask = np.zeros((200, 200, 1), dtype=np.uint8)
        mask[10:30, 10:30, 0] = 1
        mask[100:130, 100:130, 0] = 1
        tensors = self._export_load_rebuild(
            tmpdir,
            image_size,
            mask,
            class_order=[0],
            class_labels=["0"],
            aliases={0: "0"},
        )
        self._assert_all_equal(tensors)

    # --- Overlapping boxes, different classes ---

    def test_overlapping_boxes_different_classes(self, tmpdir):
        """Overlapping rectangles from different classes: overlap pixels appear
        in both channels in all formats."""
        image_size = (100, 100)
        mask = np.zeros((100, 100, 2), dtype=np.uint8)
        mask[20:60, 20:60, 0] = 1
        mask[40:80, 40:80, 1] = 1
        tensors = self._export_load_rebuild(
            tmpdir,
            image_size,
            mask,
            class_order=[0, 1],
            class_labels=["0", "1"],
            aliases={0: "0", 1: "1"},
        )
        self._assert_all_equal(tensors)

    # --- Alias labels ---

    def test_alias_labels_all_formats_match(self, tmpdir):
        """Class alias strings resolve correctly in every format."""
        image_size = (100, 100)
        mask = np.zeros((100, 100, 2), dtype=np.uint8)
        mask[5:25, 5:25, 0] = 1
        mask[60:90, 60:90, 1] = 1
        aliases = {0: "cat", 1: "dog"}
        tensors = self._export_load_rebuild(
            tmpdir,
            image_size,
            mask,
            class_order=[0, 1],
            class_labels=["cat", "dog"],
            aliases=aliases,
        )
        self._assert_all_equal(tensors)

    # --- Various image resolutions ---

    @pytest.mark.parametrize(
        "image_size",
        [
            (7, 13),
            (1, 1),
            (3, 3),
            (101, 77),
            (480, 640),
            (333, 500),
            (256, 255),
        ],
        ids=["7x13", "1x1", "3x3", "101x77", "480x640", "333x500", "256x255"],
    )
    def test_various_resolutions(self, tmpdir, image_size):
        """NPZ == YOLO Det == YOLO Seg == COCO across many resolutions."""
        h, w = image_size
        bh = max(1, int(h * 0.4))
        bw = max(1, int(w * 0.4))
        y1 = (h - bh) // 2
        x1 = (w - bw) // 2
        mask = _rect_mask(h, w, y1, y1 + bh, x1, x1 + bw)
        mask_3d = mask.reshape(h, w, 1)

        tensors = self._export_load_rebuild(
            tmpdir,
            image_size,
            mask_3d,
            class_order=[0],
            class_labels=["0"],
            aliases={0: "0"},
        )
        self._assert_all_equal(tensors)

    # --- Edge-aligned box ---

    @pytest.mark.parametrize(
        "image_size",
        [(99, 99), (101, 201), (333, 777)],
        ids=["99x99", "101x201", "333x777"],
    )
    def test_edge_aligned_box(self, tmpdir, image_size):
        """Box touching image edges: all formats agree."""
        h, w = image_size
        mask = _rect_mask(h, w, 0, h // 3, 0, w)
        mask_3d = mask.reshape(h, w, 1)

        tensors = self._export_load_rebuild(
            tmpdir,
            image_size,
            mask_3d,
            class_order=[0],
            class_labels=["0"],
            aliases={0: "0"},
        )
        self._assert_all_equal(tensors)

    # --- Full-image mask ---

    def test_full_image_mask(self, tmpdir):
        """Mask covering the entire image: all formats agree."""
        image_size = (50, 80)
        mask = np.ones((50, 80, 1), dtype=np.uint8)
        tensors = self._export_load_rebuild(
            tmpdir,
            image_size,
            mask,
            class_order=[0],
            class_labels=["0"],
            aliases={0: "0"},
        )
        self._assert_all_equal(tensors)

    # --- Multiple classes at various odd resolutions ---

    @pytest.mark.parametrize(
        "image_size",
        [(51, 73), (199, 301), (479, 641)],
        ids=["51x73", "199x301", "479x641"],
    )
    def test_odd_resolution_multiple_classes(self, tmpdir, image_size):
        """Multiple classes on odd-resolution images: all 4 formats agree."""
        h, w = image_size
        bh = max(1, h // 5)
        bw = max(1, w // 5)

        mask = np.zeros((h, w, 2), dtype=np.uint8)
        mask[1 : 1 + bh, 1 : 1 + bw, 0] = 1
        mask[h - bh - 1 : h - 1, w - bw - 1 : w - 1, 1] = 1

        tensors = self._export_load_rebuild(
            tmpdir,
            image_size,
            mask,
            class_order=[0, 1],
            class_labels=["0", "1"],
            aliases={0: "0", 1: "1"},
        )
        self._assert_all_equal(tensors)
