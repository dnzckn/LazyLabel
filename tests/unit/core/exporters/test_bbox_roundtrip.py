"""Regression tests for downgrading masks to bounding boxes and back.

These tests all drive ``FileManager.load_existing_mask`` — the entry point the
application actually uses — rather than calling per-format loaders directly.
That distinction matters: the loaders were fine, but every bounding box format
was unreachable through the real call path.

Covered guarantees:

1. **Round trip through the real entry point** for every format, including
   when the caller does not know the image size.
2. **One box per object.** Same-class objects that touch or overlap must not
   fuse into a single box.
3. **Load priority.** With several annotation files on disk the most faithful
   one wins, and a stale file can never shadow a fresh one.
4. **Class identity.** Ids and aliases survive, and two classes never collapse
   into one.
5. **Degenerate geometry.** One-pixel objects survive every format.
"""

import json
import os
import xml.etree.ElementTree as ET

import cv2
import numpy as np
import pytest

from lazylabel.core.exporters import (
    EXPORTERS,
    LOAD_PRIORITY,
    ExportContext,
    ExportFormat,
    delete_all_outputs,
    export_all,
)
from lazylabel.core.file_manager import FileManager
from lazylabel.core.segment_manager import SegmentManager

IMAGE_H, IMAGE_W = 100, 120

BBOX_FORMATS = [
    ExportFormat.YOLO_DETECTION,
    ExportFormat.PASCAL_VOC,
    ExportFormat.CREATEML,
    ExportFormat.COCO_JSON,
]

LOADABLE_FORMATS = [
    ExportFormat.NPZ,
    ExportFormat.NPZ_CLASS_MAP,
    ExportFormat.YOLO_SEGMENTATION,
    *BBOX_FORMATS,
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_image(tmp_path, h=IMAGE_H, w=IMAGE_W):
    """Write a real image file so the size can be read back from disk."""
    path = str(tmp_path / "img.png")
    cv2.imwrite(path, np.zeros((h, w, 3), dtype=np.uint8))
    return path


def _rect(y1, y2, x1, x2, h=IMAGE_H, w=IMAGE_W):
    mask = np.zeros((h, w), dtype=bool)
    mask[y1:y2, x1:x2] = True
    return mask


def _segment(mask, class_id):
    return {"mask": mask, "type": "Loaded", "vertices": None, "class_id": class_id}


def _make_sm(segments, aliases=None):
    sm = SegmentManager()
    if aliases:
        sm.class_aliases = dict(aliases)
    for seg in segments:
        sm.add_segment(dict(seg))
    return sm


def _export(image_path, sm, formats, image_size=(IMAGE_H, IMAGE_W)):
    """Build an ExportContext the way the app does and run the exporters."""
    class_order = sm.get_unique_class_ids()
    mask_tensor = sm.create_final_mask_tensor(image_size, class_order)
    ctx = ExportContext(
        image_path=image_path,
        image_size=image_size,
        class_order=class_order,
        class_labels=[sm.get_class_alias(cid) for cid in class_order],
        class_aliases=dict(sm.class_aliases),
        mask_tensor=mask_tensor,
        instances=sm.create_instance_contours(image_size, class_order, mask_tensor),
    )
    return export_all(set(formats), ctx)


def _load(image_path, image_size=(IMAGE_H, IMAGE_W)):
    """Load through the real entry point and return the segment manager."""
    sm = SegmentManager()
    FileManager(sm).load_existing_mask(image_path, image_size=image_size)
    return sm


def _boxes(sm):
    """Bounding box of every loaded segment as sorted (class_id, x1, y1, x2, y2).

    x2/y2 are exclusive, matching the convention used when writing masks.
    """
    out = []
    for seg in sm.segments:
        ys, xs = np.where(seg["mask"])
        out.append(
            (
                seg["class_id"],
                int(xs.min()),
                int(ys.min()),
                int(xs.max()) + 1,
                int(ys.max()) + 1,
            )
        )
    return sorted(out)


# ---------------------------------------------------------------------------
# 1. Round trip through the real entry point
# ---------------------------------------------------------------------------


class TestLoadExistingMaskRoundTrip:
    """Every format must survive export -> load_existing_mask."""

    SEGMENTS = [
        _segment(_rect(10, 30, 10, 40), 0),
        _segment(_rect(50, 80, 60, 110), 1),
    ]
    EXPECTED = [(0, 10, 10, 40, 30), (1, 60, 50, 110, 80)]

    @pytest.mark.parametrize("fmt", LOADABLE_FORMATS, ids=lambda f: f.value)
    def test_roundtrip_with_image_size(self, tmp_path, fmt):
        image_path = _write_image(tmp_path)
        sm = _make_sm(self.SEGMENTS, {0: "dog", 1: "cat"})
        assert _export(image_path, sm, [fmt])

        assert _boxes(_load(image_path)) == self.EXPECTED

    @pytest.mark.parametrize("fmt", LOADABLE_FORMATS, ids=lambda f: f.value)
    def test_roundtrip_without_image_size(self, tmp_path, fmt):
        """The size is read from the image when the caller omits it.

        Callers in sequence mode and the multi-view -> single-view restore do
        not pass one; before this was handled, every non-NPZ format silently
        loaded nothing.
        """
        image_path = _write_image(tmp_path)
        sm = _make_sm(self.SEGMENTS, {0: "dog", 1: "cat"})
        _export(image_path, sm, [fmt])

        loaded = SegmentManager()
        FileManager(loaded).load_existing_mask(image_path)

        assert _boxes(loaded) == self.EXPECTED

    @pytest.mark.parametrize(
        "fmt", [f for f in BBOX_FORMATS if f != ExportFormat.YOLO_DETECTION]
    )
    def test_named_formats_restore_aliases(self, tmp_path, fmt):
        """Formats that store label names bring the names back."""
        image_path = _write_image(tmp_path)
        sm = _make_sm(self.SEGMENTS, {0: "dog", 1: "cat"})
        _export(image_path, sm, [fmt])

        assert sorted(_load(image_path).class_aliases.values()) == ["cat", "dog"]


# ---------------------------------------------------------------------------
# 2. One box per object
# ---------------------------------------------------------------------------


class TestPerObjectBoxes:
    """Same-class objects must stay separate through a bbox downgrade.

    Deriving boxes from the merged per-class mask channel fuses anything that
    touches, silently turning two annotations into one.
    """

    @pytest.mark.parametrize("fmt", BBOX_FORMATS, ids=lambda f: f.value)
    def test_overlapping_same_class_stay_separate(self, tmp_path, fmt):
        image_path = _write_image(tmp_path)
        sm = _make_sm(
            [
                _segment(_rect(10, 40, 10, 50), 0),
                _segment(_rect(20, 60, 30, 80), 0),
            ],
            {0: "dog"},
        )
        _export(image_path, sm, [fmt])

        assert _boxes(_load(image_path)) == [
            (0, 10, 10, 50, 40),
            (0, 30, 20, 80, 60),
        ]

    @pytest.mark.parametrize("fmt", BBOX_FORMATS, ids=lambda f: f.value)
    def test_touching_same_class_stay_separate(self, tmp_path, fmt):
        image_path = _write_image(tmp_path)
        sm = _make_sm(
            [
                _segment(_rect(10, 40, 10, 50), 0),
                _segment(_rect(10, 40, 50, 90), 0),
            ],
            {0: "dog"},
        )
        _export(image_path, sm, [fmt])

        assert _boxes(_load(image_path)) == [
            (0, 10, 10, 50, 40),
            (0, 50, 10, 90, 40),
        ]

    @pytest.mark.parametrize("fmt", BBOX_FORMATS, ids=lambda f: f.value)
    def test_disjoint_same_class_stay_separate(self, tmp_path, fmt):
        image_path = _write_image(tmp_path)
        sm = _make_sm(
            [
                _segment(_rect(10, 30, 10, 40), 0),
                _segment(_rect(60, 90, 60, 110), 0),
            ],
            {0: "dog"},
        )
        _export(image_path, sm, [fmt])

        assert len(_load(image_path).segments) == 2

    def test_yolo_detection_writes_one_line_per_object(self, tmp_path):
        image_path = _write_image(tmp_path)
        sm = _make_sm(
            [
                _segment(_rect(10, 40, 10, 50), 0),
                _segment(_rect(20, 60, 30, 80), 0),
            ],
            {0: "dog"},
        )
        _export(image_path, sm, [ExportFormat.YOLO_DETECTION])

        lines = (tmp_path / "img.txt").read_text().strip().splitlines()
        assert len(lines) == 2

    def test_pascal_voc_writes_one_object_element_per_object(self, tmp_path):
        image_path = _write_image(tmp_path)
        sm = _make_sm(
            [
                _segment(_rect(10, 40, 10, 50), 0),
                _segment(_rect(20, 60, 30, 80), 0),
            ],
            {0: "dog"},
        )
        _export(image_path, sm, [ExportFormat.PASCAL_VOC])

        root = ET.parse(str(tmp_path / "img.xml")).getroot()
        assert len(root.findall("object")) == 2

    def test_createml_writes_one_annotation_per_object(self, tmp_path):
        image_path = _write_image(tmp_path)
        sm = _make_sm(
            [
                _segment(_rect(10, 40, 10, 50), 0),
                _segment(_rect(20, 60, 30, 80), 0),
            ],
            {0: "dog"},
        )
        _export(image_path, sm, [ExportFormat.CREATEML])

        data = json.loads((tmp_path / "img_createml.json").read_text())
        assert len(data[0]["annotations"]) == 2

    @pytest.mark.parametrize(
        "fmt",
        [ExportFormat.NPZ, ExportFormat.NPZ_CLASS_MAP],
        ids=lambda f: f.value,
    )
    def test_mask_formats_fuse_by_class_on_reload_by_design(self, tmp_path, fmt):
        """The mask formats carry no instance identity — this is expected.

        NPZ stores one channel per class and the class map one label per pixel,
        so reloading either gives one segment per class. Instance separation is
        the job of the detection and polygon formats; do not "fix" this by
        splitting channels into connected components.
        """
        image_path = _write_image(tmp_path)
        sm = _make_sm(
            [
                _segment(_rect(10, 30, 10, 40), 0),
                _segment(_rect(60, 90, 60, 110), 0),
            ],
            {0: "dog"},
        )
        _export(image_path, sm, [fmt])

        loaded = _load(image_path).segments
        assert len(loaded) == 1
        # Both objects are present, just carried by a single segment.
        assert int(loaded[0]["mask"].sum()) == 20 * 30 + 30 * 50

    def test_instances_absent_falls_back_to_merged_contours(self, tmp_path):
        """An ExportContext without instance data still exports."""
        image_path = _write_image(tmp_path)
        mask_tensor = np.zeros((IMAGE_H, IMAGE_W, 1), dtype=np.uint8)
        mask_tensor[10:40, 10:50, 0] = 1
        mask_tensor[10:40, 50:90, 0] = 1

        ctx = ExportContext(
            image_path=image_path,
            image_size=(IMAGE_H, IMAGE_W),
            class_order=[0],
            class_labels=["dog"],
            class_aliases={0: "dog"},
            mask_tensor=mask_tensor,
        )
        assert export_all({ExportFormat.YOLO_DETECTION}, ctx)
        assert len(_load(image_path).segments) == 1

    def test_instances_honour_the_final_tensor(self, tmp_path):
        """Crop and pixel-priority are applied to the tensor, not the segments.

        Instance contours are intersected with the final tensor so those
        decisions still reach the bounding boxes.
        """
        image_path = _write_image(tmp_path)
        sm = _make_sm([_segment(_rect(10, 40, 10, 50), 0)], {0: "dog"})
        class_order = sm.get_unique_class_ids()
        mask_tensor = sm.create_final_mask_tensor((IMAGE_H, IMAGE_W), class_order)
        cropped = FileManager(sm)._apply_crop_to_mask(mask_tensor, (20, 20, 40, 30))

        instances = sm.create_instance_contours(
            (IMAGE_H, IMAGE_W), class_order, cropped
        )
        ctx = ExportContext(
            image_path=image_path,
            image_size=(IMAGE_H, IMAGE_W),
            class_order=class_order,
            class_labels=["dog"],
            class_aliases={0: "dog"},
            mask_tensor=cropped,
            crop_coords=(20, 20, 40, 30),
            instances=instances,
        )
        export_all({ExportFormat.YOLO_DETECTION}, ctx)

        assert _boxes(_load(image_path)) == [(0, 20, 20, 40, 30)]


# ---------------------------------------------------------------------------
# 3. Load priority
# ---------------------------------------------------------------------------


class TestLoadPriority:
    """The most faithful annotation file on disk is the one that gets loaded."""

    EXPECTED_ORDER = [
        (".npz", 1),  # one-hot tensor: same-class objects share a channel
        ("_seg.txt", 2),  # polygons: per object
        ("_coco.json", 2),
        ("_CM.npz", 1),  # class map: one label per pixel, so per class
        (".xml", 2),
        ("_createml.json", 2),
        (".txt", 2),
    ]

    def _export_everything(self, tmp_path):
        image_path = _write_image(tmp_path)
        sm = _make_sm(
            [
                _segment(_rect(10, 40, 10, 50), 0),
                _segment(_rect(20, 60, 30, 80), 0),
            ],
            {0: "dog"},
        )
        _export(image_path, sm, list(ExportFormat))
        return image_path

    def test_every_format_is_written(self, tmp_path):
        self._export_everything(tmp_path)
        for suffix, _ in self.EXPECTED_ORDER:
            assert (tmp_path / f"img{suffix}").exists(), suffix

    def test_chain_walks_from_most_to_least_faithful(self, tmp_path):
        """Delete the winner and the next format down takes over, in order."""
        image_path = self._export_everything(tmp_path)

        for suffix, expected_segments in self.EXPECTED_ORDER:
            assert (tmp_path / f"img{suffix}").exists()
            assert len(_load(image_path).segments) == expected_segments, suffix
            os.remove(tmp_path / f"img{suffix}")

        assert _load(image_path).segments == []

    def test_npz_wins_over_a_bbox_downgrade(self, tmp_path):
        """A mask format is never passed over for a bbox version of itself."""
        image_path = _write_image(tmp_path)
        donut = np.zeros((IMAGE_H, IMAGE_W), dtype=bool)
        donut[10:60, 10:60] = True
        donut[25:45, 25:45] = False
        sm = _make_sm([_segment(donut, 0)], {0: "dog"})
        _export(image_path, sm, [ExportFormat.NPZ, ExportFormat.YOLO_DETECTION])

        loaded = _load(image_path)
        # The bbox version would have filled the hole in.
        np.testing.assert_array_equal(loaded.segments[0]["mask"], donut)

    def test_exporting_never_deletes_a_file(self, tmp_path):
        """Saving writes; it does not clean up. Exporting in every format is
        a legitimate thing to do, and files next to the image may be another
        format's export or ground truth that shipped with the dataset.
        """
        image_path = _write_image(tmp_path)
        foreign_voc = tmp_path / "img.xml"
        foreign_voc.write_text("<annotation><object/></annotation>")
        foreign_createml = tmp_path / "img_createml.json"
        foreign_createml.write_text("[]")

        sm = _make_sm([_segment(_rect(10, 30, 10, 40), 0)], {0: "dog"})
        _export(image_path, sm, [ExportFormat.NPZ])
        # A second save with a different, lower-priority selection.
        _export(image_path, sm, [ExportFormat.YOLO_DETECTION])

        for name in ("img.npz", "img.txt", "img.xml", "img_createml.json"):
            assert (tmp_path / name).exists(), name

    def test_an_exporter_with_nothing_to_write_deletes_nothing(self, tmp_path):
        image_path = _write_image(tmp_path)
        sm = _make_sm([_segment(_rect(10, 30, 10, 40), 0)], {0: "dog"})
        _export(image_path, sm, [ExportFormat.YOLO_DETECTION])

        empty = ExportContext(
            image_path=image_path,
            image_size=(IMAGE_H, IMAGE_W),
            class_order=[0],
            class_labels=["dog"],
            class_aliases={0: "dog"},
            mask_tensor=np.zeros((IMAGE_H, IMAGE_W, 1), dtype=np.uint8),
        )
        assert export_all({ExportFormat.YOLO_DETECTION}, empty) == []
        assert (tmp_path / "img.txt").exists()

    def test_clearing_every_segment_removes_all_annotation_files(self, tmp_path):
        """Deleting all segments and saving means the image is unannotated.

        This is the one path that removes files, and it removes every format
        rather than just the one currently selected.
        """
        image_path = _write_image(tmp_path)
        sm = _make_sm([_segment(_rect(10, 30, 10, 40), 0)], {0: "dog"})
        _export(image_path, sm, list(ExportFormat))
        foreign = tmp_path / "img_createml.json"
        assert foreign.exists()

        deleted = delete_all_outputs(image_path)

        assert len(deleted) == len(ExportFormat)
        assert sorted(p.name for p in tmp_path.iterdir()) == ["img.png"]
        assert _load(image_path).segments == []

    def test_highest_fidelity_wins_when_formats_disagree(self, tmp_path):
        """With several files present, the priority chain picks — not the
        writer, and not whichever was saved last.
        """
        image_path = _write_image(tmp_path)
        two_objects = _make_sm(
            [
                _segment(_rect(10, 30, 10, 40), 0),
                _segment(_rect(50, 80, 60, 110), 0),
            ],
            {0: "dog"},
        )
        _export(image_path, two_objects, [ExportFormat.NPZ])

        one_object = _make_sm([_segment(_rect(10, 30, 10, 40), 0)], {0: "dog"})
        _export(image_path, one_object, [ExportFormat.YOLO_DETECTION])

        # Both files survive, and the NPZ outranks the TXT.
        assert (tmp_path / "img.npz").exists()
        assert (tmp_path / "img.txt").exists()
        assert len(_load(image_path).segments) == 1  # one channel, two blobs

    def test_load_chain_matches_the_exporter_priority(self):
        """LOAD_PRIORITY documents the order; _LOAD_CHAIN implements it."""
        chain = [
            EXPORTERS[fmt].get_output_path("img.png").removeprefix("img")
            for fmt in LOAD_PRIORITY
        ]
        assert chain == [suffix for suffix, _ in FileManager._LOAD_CHAIN]

    def test_no_annotation_files_loads_nothing(self, tmp_path):
        image_path = _write_image(tmp_path)
        assert _load(image_path).segments == []


# ---------------------------------------------------------------------------
# 4. Class identity
# ---------------------------------------------------------------------------


class TestClassIdentity:
    def test_non_contiguous_class_ids_survive_yolo_detection(self, tmp_path):
        image_path = _write_image(tmp_path)
        sm = _make_sm(
            [
                _segment(_rect(10, 30, 10, 40), 3),
                _segment(_rect(50, 80, 60, 110), 7),
            ]
        )
        _export(image_path, sm, [ExportFormat.YOLO_DETECTION])

        assert sorted(s["class_id"] for s in _load(image_path).segments) == [3, 7]

    @pytest.mark.parametrize(
        "fmt", [ExportFormat.PASCAL_VOC, ExportFormat.CREATEML], ids=lambda f: f.value
    )
    def test_numeric_and_named_labels_do_not_collide(self, tmp_path, fmt):
        """A file mixing ``0`` with ``dog`` must stay two classes.

        Assigning ids to names before the numeric labels have claimed theirs
        hands both the id 0 and merges the two classes.
        """
        image_path = _write_image(tmp_path)
        sm = _make_sm(
            [
                _segment(_rect(10, 30, 10, 40), 0),  # no alias -> label "0"
                _segment(_rect(50, 80, 60, 110), 1),  # alias "dog"
            ],
            {1: "dog"},
        )
        _export(image_path, sm, [fmt])

        loaded = _load(image_path)
        class_ids = {s["class_id"] for s in loaded.segments}
        assert len(loaded.segments) == 2
        assert len(class_ids) == 2, f"classes collapsed into {class_ids}"

    def test_named_labels_are_registered_as_aliases(self, tmp_path):
        image_path = _write_image(tmp_path)
        sm = _make_sm(
            [
                _segment(_rect(10, 30, 10, 40), 0),
                _segment(_rect(50, 80, 60, 110), 1),
            ],
            {0: "dog", 1: "cat"},
        )
        _export(image_path, sm, [ExportFormat.PASCAL_VOC])

        loaded = _load(image_path)
        by_id = {
            s["class_id"]: loaded.class_aliases[s["class_id"]] for s in loaded.segments
        }
        assert sorted(by_id.values()) == ["cat", "dog"]

    def test_npz_class_map_keeps_class_zero(self, tmp_path):
        """Class id 0 collides with the class map's background value.

        The exporter stores a foreground mask so it can still be recovered.
        """
        image_path = _write_image(tmp_path)
        sm = _make_sm([_segment(_rect(10, 30, 10, 40), 0)], {0: "dog"})
        _export(image_path, sm, [ExportFormat.NPZ_CLASS_MAP])

        loaded = _load(image_path)
        assert len(loaded.segments) == 1
        assert loaded.segments[0]["class_id"] == 0
        assert int(loaded.segments[0]["mask"].sum()) == 20 * 30

    def test_npz_class_map_ignores_a_mismatched_image(self, tmp_path):
        image_path = _write_image(tmp_path)
        sm = _make_sm([_segment(_rect(10, 30, 10, 40), 0)], {0: "dog"})
        _export(image_path, sm, [ExportFormat.NPZ_CLASS_MAP])

        loaded = SegmentManager()
        FileManager(loaded).load_npz_class_map(
            str(tmp_path / "img_CM.npz"), image_size=(50, 50)
        )
        assert loaded.segments == []


# ---------------------------------------------------------------------------
# 5. Degenerate geometry
# ---------------------------------------------------------------------------


class TestDegenerateObjects:
    """One-pixel objects have contours no polygon format can express."""

    @pytest.mark.parametrize("fmt", LOADABLE_FORMATS, ids=lambda f: f.value)
    def test_single_pixel_object_survives(self, tmp_path, fmt):
        image_path = _write_image(tmp_path)
        sm = _make_sm([_segment(_rect(10, 11, 10, 11), 0)], {0: "dog"})
        assert _export(image_path, sm, [fmt]), f"{fmt.value} wrote nothing"

        assert _boxes(_load(image_path)) == [(0, 10, 10, 11, 11)]

    @pytest.mark.parametrize("fmt", LOADABLE_FORMATS, ids=lambda f: f.value)
    def test_one_pixel_wide_line_survives(self, tmp_path, fmt):
        image_path = _write_image(tmp_path)
        sm = _make_sm([_segment(_rect(10, 17, 10, 11), 0)], {0: "dog"})
        assert _export(image_path, sm, [fmt]), f"{fmt.value} wrote nothing"

        assert _boxes(_load(image_path)) == [(0, 10, 10, 11, 17)]

    @pytest.mark.parametrize(
        "fmt",
        [ExportFormat.COCO_JSON, ExportFormat.YOLO_SEGMENTATION],
        ids=lambda f: f.value,
    )
    def test_diagonal_line_is_not_inflated_to_its_bounding_box(self, tmp_path, fmt):
        """A 45-degree 1-px line also compresses to a two-point contour.

        Substituting the bounding box there would fill the whole square, so a
        thin diagonal would come back as a solid blob.
        """
        image_path = _write_image(tmp_path)
        mask = np.zeros((IMAGE_H, IMAGE_W), dtype=bool)
        for i in range(12):
            mask[10 + i, 10 + i] = True
        sm = _make_sm([_segment(mask, 0)], {0: "dog"})
        assert _export(image_path, sm, [fmt]), f"{fmt.value} wrote nothing"

        loaded = _load(image_path).segments
        assert len(loaded) == 1
        area = int(loaded[0]["mask"].sum())
        assert area < 30, f"diagonal inflated to {area} px (bounding box is 144)"

    @pytest.mark.parametrize("fmt", BBOX_FORMATS, ids=lambda f: f.value)
    def test_edge_touching_object_survives(self, tmp_path, fmt):
        image_path = _write_image(tmp_path)
        sm = _make_sm(
            [
                _segment(_rect(0, 20, 0, 30), 0),
                _segment(_rect(80, IMAGE_H, 90, IMAGE_W), 0),
            ],
            {0: "dog"},
        )
        _export(image_path, sm, [fmt])

        assert _boxes(_load(image_path)) == [
            (0, 0, 0, 30, 20),
            (0, 90, 80, IMAGE_W, IMAGE_H),
        ]


# ---------------------------------------------------------------------------
# 6. Malformed input must not crash the image load
# ---------------------------------------------------------------------------


class TestMalformedInput:
    """A damaged sidecar loads nothing rather than taking the app down."""

    def _load_raw(self, tmp_path, name, content):
        image_path = _write_image(tmp_path)
        (tmp_path / name).write_text(content)
        sm = SegmentManager()
        FileManager(sm).load_existing_mask(image_path, image_size=(IMAGE_H, IMAGE_W))
        return sm

    def test_truncated_yolo_lines_are_skipped(self, tmp_path):
        sm = self._load_raw(tmp_path, "img.txt", "0 0.5\n0 0.5 0.5 0.2 0.2\nnope\n")
        assert len(sm.segments) == 1

    def test_malformed_coco_categories_do_not_raise(self, tmp_path):
        sm = self._load_raw(
            tmp_path,
            "img_coco.json",
            json.dumps({"categories": [{"name": "dog"}, "junk"], "annotations": []}),
        )
        assert sm.segments == []

    def test_coco_that_is_not_an_object_does_not_raise(self, tmp_path):
        sm = self._load_raw(tmp_path, "img_coco.json", json.dumps([1, 2, 3]))
        assert sm.segments == []

    def test_coco_falls_back_to_bbox_for_a_degenerate_polygon(self, tmp_path):
        """A polygon that cannot be rasterized must not discard the object."""
        sm = self._load_raw(
            tmp_path,
            "img_coco.json",
            json.dumps(
                {
                    "categories": [{"id": 0, "name": "dog"}],
                    "annotations": [
                        {
                            "id": 1,
                            "image_id": 1,
                            "category_id": 0,
                            "segmentation": [[]],
                            "bbox": [10, 10, 30, 20],
                        }
                    ],
                }
            ),
        )
        assert _boxes(sm) == [(0, 10, 10, 40, 30)]

    def test_coco_rle_segmentation_falls_back_to_bbox(self, tmp_path):
        sm = self._load_raw(
            tmp_path,
            "img_coco.json",
            json.dumps(
                {
                    "categories": [{"id": 0, "name": "dog"}],
                    "annotations": [
                        {
                            "id": 1,
                            "image_id": 1,
                            "category_id": 0,
                            "segmentation": {"counts": [1, 2], "size": [10, 10]},
                            "bbox": [10, 10, 30, 20],
                        }
                    ],
                }
            ),
        )
        assert _boxes(sm) == [(0, 10, 10, 40, 30)]

    def test_malformed_createml_does_not_raise(self, tmp_path):
        sm = self._load_raw(
            tmp_path, "img_createml.json", json.dumps([{"annotations": ["junk"]}])
        )
        assert sm.segments == []

    def test_unparsable_xml_does_not_raise(self, tmp_path):
        sm = self._load_raw(tmp_path, "img.xml", "<annotation><object>")
        assert sm.segments == []

    def test_corrupt_npz_does_not_raise(self, tmp_path):
        image_path = _write_image(tmp_path)
        (tmp_path / "img.npz").write_bytes(b"not an npz")

        sm = SegmentManager()
        FileManager(sm).load_existing_mask(image_path)
        assert sm.segments == []

    def test_corrupt_npz_falls_through_to_the_next_format(self, tmp_path):
        """One damaged sidecar must not hide a healthy lower-priority one."""
        image_path = _write_image(tmp_path)
        sm = _make_sm([_segment(_rect(10, 30, 10, 40), 0)], {0: "dog"})
        _export(image_path, sm, [ExportFormat.YOLO_DETECTION])
        (tmp_path / "img.npz").write_bytes(b"not an npz")

        assert _boxes(_load(image_path)) == [(0, 10, 10, 40, 30)]

    def test_missing_image_and_no_size_loads_nothing(self, tmp_path):
        """Without a readable image there is no size, so nothing can be built."""
        image_path = str(tmp_path / "missing.png")
        (tmp_path / "missing.txt").write_text("0 0.5 0.5 0.2 0.2\n")

        sm = SegmentManager()
        FileManager(sm).load_existing_mask(image_path)
        assert sm.segments == []


# ---------------------------------------------------------------------------
# 7. Cross-format equivalence with several objects
# ---------------------------------------------------------------------------


class TestCrossFormatEquivalenceMultiObject:
    """Every bbox format must agree, object for object."""

    def test_all_bbox_formats_agree(self, tmp_path):
        segments = [
            _segment(_rect(10, 40, 10, 50), 0),
            _segment(_rect(20, 60, 30, 80), 0),
            _segment(_rect(70, 90, 5, 25), 1),
        ]

        results = {}
        for fmt in BBOX_FORMATS:
            fmt_dir = tmp_path / fmt.value
            fmt_dir.mkdir()
            image_path = _write_image(fmt_dir)
            sm = _make_sm(segments, {0: "dog", 1: "cat"})
            written = _export(image_path, sm, [fmt])
            assert written, f"{fmt.value} wrote nothing"
            results[fmt] = _boxes(_load(image_path))

        reference_fmt, reference = next(iter(results.items()))
        assert len(reference) == 3
        for fmt, boxes in results.items():
            assert boxes == reference, (
                f"{fmt.value} differs from {reference_fmt.value}: "
                f"{boxes} != {reference}"
            )

    def test_every_registered_format_has_a_load_chain_entry(self):
        """A format that can be written must be reachable when loading."""
        suffixes = {suffix for suffix, _ in FileManager._LOAD_CHAIN}
        for fmt, exporter in EXPORTERS.items():
            path = exporter.get_output_path("/tmp/img.png")
            assert any(path.endswith(suffix) for suffix in suffixes), (
                f"{fmt.value} writes {path} which no loader claims"
            )


# ---------------------------------------------------------------------------
# 8. Detecting which images are already annotated
# ---------------------------------------------------------------------------


class TestFindAnnotationFile:
    """``find_annotation_file`` gates 'is this image labelled?' decisions.

    Probing only for ``.npz`` makes a bbox-annotated image look untouched, so
    propagation happily overwrites hand-made labels.
    """

    @pytest.mark.parametrize("fmt", LOADABLE_FORMATS, ids=lambda f: f.value)
    def test_finds_every_format(self, tmp_path, fmt):
        image_path = _write_image(tmp_path)
        sm = _make_sm([_segment(_rect(10, 30, 10, 40), 0)], {0: "dog"})
        _export(image_path, sm, [fmt])

        assert FileManager.find_annotation_file(image_path) is not None

    def test_returns_none_when_unannotated(self, tmp_path):
        assert FileManager.find_annotation_file(_write_image(tmp_path)) is None

    def test_returns_the_highest_priority_file(self, tmp_path):
        image_path = _write_image(tmp_path)
        sm = _make_sm([_segment(_rect(10, 30, 10, 40), 0)], {0: "dog"})
        _export(image_path, sm, list(ExportFormat))

        assert FileManager.find_annotation_file(image_path).endswith(".npz")


# ---------------------------------------------------------------------------
# 9. Export format selection
# ---------------------------------------------------------------------------


class TestFormatSelection:
    def test_empty_format_set_is_a_no_op(self, tmp_path):
        """Deselecting every format must not erase the existing annotations."""
        image_path = _write_image(tmp_path)
        sm = _make_sm([_segment(_rect(10, 30, 10, 40), 0)], {0: "dog"})
        _export(image_path, sm, [ExportFormat.NPZ, ExportFormat.YOLO_DETECTION])

        assert _export(image_path, sm, []) == []
        assert (tmp_path / "img.npz").exists()
        assert (tmp_path / "img.txt").exists()

    def test_selected_formats_are_all_written(self, tmp_path):
        image_path = _write_image(tmp_path)
        sm = _make_sm([_segment(_rect(10, 30, 10, 40), 0)], {0: "dog"})

        written = _export(image_path, sm, list(ExportFormat))

        assert len(written) == len(ExportFormat)


# ---------------------------------------------------------------------------
# 10. Legacy NPZ layouts
# ---------------------------------------------------------------------------


class TestLegacyNpzLayouts:
    """Older saves used different key names and axis orders."""

    def test_masks_key_as_hwc_tensor(self, tmp_path):
        image_path = _write_image(tmp_path)
        tensor = np.zeros((IMAGE_H, IMAGE_W, 2), dtype=np.uint8)
        tensor[10:30, 10:40, 0] = 1
        tensor[50:80, 60:110, 1] = 1
        np.savez_compressed(str(tmp_path / "img.npz"), masks=tensor)

        assert _boxes(_load(image_path)) == [
            (0, 10, 10, 40, 30),
            (1, 60, 50, 110, 80),
        ]

    def test_masks_stack_with_class_ids(self, tmp_path):
        image_path = _write_image(tmp_path)
        stack = np.zeros((2, IMAGE_H, IMAGE_W), dtype=np.uint8)
        stack[0, 10:30, 10:40] = 1
        stack[1, 50:80, 60:110] = 1
        np.savez_compressed(
            str(tmp_path / "img.npz"), masks=stack, class_ids=np.array([4, 9])
        )

        assert _boxes(_load(image_path)) == [
            (4, 10, 10, 40, 30),
            (9, 60, 50, 110, 80),
        ]

    def test_npz_without_class_order_falls_back_to_channel_index(self, tmp_path):
        image_path = _write_image(tmp_path)
        tensor = np.zeros((IMAGE_H, IMAGE_W, 2), dtype=np.uint8)
        tensor[10:30, 10:40, 1] = 1
        np.savez_compressed(str(tmp_path / "img.npz"), mask=tensor)

        assert _boxes(_load(image_path)) == [(1, 10, 10, 40, 30)]

    def test_class_order_beats_the_channel_index(self, tmp_path):
        image_path = _write_image(tmp_path)
        sm = _make_sm([_segment(_rect(10, 30, 10, 40), 5)], {5: "dog"})
        _export(image_path, sm, [ExportFormat.NPZ])

        assert _boxes(_load(image_path)) == [(5, 10, 10, 40, 30)]
