"""Unit tests for FileManager NPZ saving and loading, and bounding box TXT loading.

Tests NPZ format compatibility between single-view and multi-view modes.
Both modes should use the same "mask" key for interoperability.
Also tests load_bb_txt round-trip, class resolution, and overlap behaviour.
"""

import os
import tempfile

import cv2
import numpy as np
import pytest

from lazylabel.core.file_manager import FileManager
from lazylabel.core.segment_manager import SegmentManager


class TestNPZFormatCompatibility:
    """Tests for NPZ format compatibility between view modes."""

    @pytest.fixture
    def temp_dir(self):
        """Create a temporary directory for test files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    @pytest.fixture
    def sample_mask_2d(self):
        """Create a simple 2D mask for testing."""
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[20:40, 20:40] = 1  # Class 1 region
        return mask

    @pytest.fixture
    def sample_mask_3d(self):
        """Create a 3D mask tensor with multiple classes."""
        mask = np.zeros((100, 100, 3), dtype=np.uint8)
        mask[10:30, 10:30, 0] = 1  # Class 0 region
        mask[40:60, 40:60, 1] = 1  # Class 1 region
        mask[70:90, 70:90, 2] = 1  # Class 2 region
        return mask

    def test_single_view_saves_with_mask_key(self, temp_dir, sample_mask_3d):
        """Test that single-view format uses 'mask' key."""
        npz_path = os.path.join(temp_dir, "test.npz")

        # Simulate single-view save (from file_manager.save_npz)
        np.savez_compressed(npz_path, mask=sample_mask_3d.astype(np.uint8))

        # Verify the key is 'mask'
        with np.load(npz_path) as data:
            assert "mask" in data, "Single-view should save with 'mask' key"
            assert "masks" not in data, "Should not have 'masks' key"
            loaded = data["mask"]
            assert loaded.shape == sample_mask_3d.shape

    def test_multi_view_loads_single_view_format(self, temp_dir, sample_mask_3d):
        """Test that multi-view can load files saved by single-view."""
        npz_path = os.path.join(temp_dir, "test.npz")

        # Save in single-view format (uses 'mask' key)
        np.savez_compressed(npz_path, mask=sample_mask_3d.astype(np.uint8))

        # Load using multi-view logic (should check for 'mask' first, then 'masks')
        with np.load(npz_path, allow_pickle=True) as data:
            # Multi-view loading logic
            mask_key = (
                "mask" if "mask" in data else "masks" if "masks" in data else None
            )
            assert mask_key is not None, "Should find a mask key"
            assert mask_key == "mask", "Should prefer 'mask' key"

            masks = data[mask_key]
            if masks.ndim == 2:
                masks = np.expand_dims(masks, axis=-1)

            assert masks.shape == sample_mask_3d.shape

    def test_multi_view_loads_legacy_masks_format(self, temp_dir, sample_mask_3d):
        """Test that multi-view can load legacy files with 'masks' key."""
        npz_path = os.path.join(temp_dir, "legacy.npz")

        # Save in legacy multi-view format (uses 'masks' key)
        np.savez_compressed(npz_path, masks=sample_mask_3d.astype(np.uint8))

        # Load using multi-view logic
        with np.load(npz_path, allow_pickle=True) as data:
            mask_key = (
                "mask" if "mask" in data else "masks" if "masks" in data else None
            )
            assert mask_key is not None, "Should find a mask key"
            assert mask_key == "masks", "Should fall back to 'masks' key"

            masks = data[mask_key]
            assert masks.shape == sample_mask_3d.shape

    def test_single_view_loads_with_mask_key(self, temp_dir, sample_mask_3d):
        """Test that single-view correctly loads 'mask' key."""
        npz_path = os.path.join(temp_dir, "test.npz")

        # Save with 'mask' key
        np.savez_compressed(npz_path, mask=sample_mask_3d.astype(np.uint8))

        # Load using single-view logic (from file_manager.load_existing_mask)
        with np.load(npz_path) as data:
            assert "mask" in data
            mask_data = data["mask"]
            if mask_data.ndim == 2:
                mask_data = np.expand_dims(mask_data, axis=-1)

            # Should be able to extract individual class masks
            num_classes = mask_data.shape[2]
            assert num_classes == 3

            for i in range(num_classes):
                class_mask = mask_data[:, :, i].astype(bool)
                assert np.any(class_mask), f"Class {i} mask should have content"

    def test_2d_mask_expansion(self, temp_dir, sample_mask_2d):
        """Test that 2D masks are correctly expanded to 3D."""
        npz_path = os.path.join(temp_dir, "2d.npz")

        # Save a 2D mask
        np.savez_compressed(npz_path, mask=sample_mask_2d)

        # Load and expand
        with np.load(npz_path) as data:
            mask_data = data["mask"]
            assert mask_data.ndim == 2

            # Expand to 3D
            mask_data = np.expand_dims(mask_data, axis=-1)
            assert mask_data.ndim == 3
            assert mask_data.shape == (100, 100, 1)

    def test_empty_mask_not_added(self, temp_dir):
        """Test that empty masks (all zeros) are not added as segments."""
        npz_path = os.path.join(temp_dir, "empty.npz")

        # Create mask with one empty class
        mask = np.zeros((100, 100, 2), dtype=np.uint8)
        mask[20:40, 20:40, 0] = 1  # Class 0 has content
        # Class 1 is all zeros

        np.savez_compressed(npz_path, mask=mask)

        # Load and check
        with np.load(npz_path) as data:
            masks = data["mask"]
            segments_to_add = []

            for i in range(masks.shape[2]):
                class_mask = masks[:, :, i].astype(bool)
                if np.any(class_mask):  # Only add non-empty
                    segments_to_add.append(i)

            assert len(segments_to_add) == 1
            assert 0 in segments_to_add
            assert 1 not in segments_to_add

    def test_roundtrip_mask_integrity(self, temp_dir, sample_mask_3d):
        """Test that masks maintain integrity through save/load cycle."""
        npz_path = os.path.join(temp_dir, "roundtrip.npz")

        # Save
        np.savez_compressed(npz_path, mask=sample_mask_3d.astype(np.uint8))

        # Load
        with np.load(npz_path) as data:
            loaded = data["mask"]

        # Verify exact match
        np.testing.assert_array_equal(loaded, sample_mask_3d)


class TestLoadBBTxt:
    """Tests for loading bounding box TXT files."""

    @pytest.fixture
    def temp_dir(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    @pytest.fixture
    def file_manager(self):
        sm = SegmentManager()
        return FileManager(sm)

    def _write_txt(self, path, lines):
        with open(path, "w") as f:
            for line in lines:
                f.write(line + "\n")

    # --- basic loading ---

    def test_single_box_loaded(self, temp_dir, file_manager):
        """A single TXT line produces one segment with the correct mask region."""
        txt = os.path.join(temp_dir, "img.txt")
        # box centred at (50,50) with width=20, height=20 on a 100x100 image
        self._write_txt(txt, ["0 0.5 0.5 0.2 0.2"])

        file_manager.load_bb_txt(txt, image_size=(100, 100))

        segs = file_manager.segment_manager.segments
        assert len(segs) == 1
        mask = segs[0]["mask"]
        assert mask.shape == (100, 100)
        # interior pixel should be True
        assert mask[50, 50]
        # corner outside box should be False
        assert not mask[0, 0]

    def test_multiple_boxes_same_class(self, temp_dir, file_manager):
        """Multiple lines with the same class produce separate segments."""
        txt = os.path.join(temp_dir, "img.txt")
        self._write_txt(
            txt,
            [
                "0 0.25 0.25 0.2 0.2",
                "0 0.75 0.75 0.2 0.2",
            ],
        )

        file_manager.load_bb_txt(txt, image_size=(100, 100))

        segs = file_manager.segment_manager.segments
        assert len(segs) == 2
        assert segs[0]["class_id"] == segs[1]["class_id"] == 0

    def test_multiple_classes(self, temp_dir, file_manager):
        """Lines with different integer labels get different class_ids."""
        txt = os.path.join(temp_dir, "img.txt")
        self._write_txt(
            txt,
            [
                "0 0.25 0.25 0.2 0.2",
                "1 0.75 0.75 0.2 0.2",
            ],
        )

        file_manager.load_bb_txt(txt, image_size=(100, 100))

        segs = file_manager.segment_manager.segments
        assert len(segs) == 2
        assert segs[0]["class_id"] == 0
        assert segs[1]["class_id"] == 1

    # --- class alias resolution ---

    def test_alias_resolved_from_json(self, temp_dir, file_manager):
        """Labels are resolved via class_aliases when available."""
        file_manager.segment_manager.class_aliases = {0: "cat", 1: "dog"}
        txt = os.path.join(temp_dir, "img.txt")
        self._write_txt(txt, ["dog 0.5 0.5 0.2 0.2"])

        file_manager.load_bb_txt(txt, image_size=(100, 100))

        assert file_manager.segment_manager.segments[0]["class_id"] == 1

    def test_unknown_alias_gets_new_class_id(self, temp_dir, file_manager):
        """An unrecognised string label is assigned a new class_id and registered."""
        file_manager.segment_manager.class_aliases = {0: "cat"}
        txt = os.path.join(temp_dir, "img.txt")
        self._write_txt(txt, ["bird 0.5 0.5 0.2 0.2"])

        file_manager.load_bb_txt(txt, image_size=(100, 100))

        seg = file_manager.segment_manager.segments[0]
        assert seg["class_id"] == 1  # one above existing max (0)
        assert file_manager.segment_manager.class_aliases[1] == "bird"

    # --- overlap behaviour ---

    def test_overlapping_boxes_both_loaded(self, temp_dir, file_manager):
        """Two overlapping boxes produce two segments; overlap pixels are True in both."""
        txt = os.path.join(temp_dir, "img.txt")
        # two 40x40 boxes that overlap in the centre
        self._write_txt(
            txt,
            [
                "0 0.4 0.5 0.4 0.4",
                "1 0.6 0.5 0.4 0.4",
            ],
        )

        file_manager.load_bb_txt(txt, image_size=(100, 100))

        segs = file_manager.segment_manager.segments
        assert len(segs) == 2
        # overlap region: both masks True at the centre
        assert segs[0]["mask"][50, 50]
        assert segs[1]["mask"][50, 50]

    # --- edge cases ---

    def test_malformed_lines_skipped(self, temp_dir, file_manager):
        """Lines with wrong column count or non-numeric coords are skipped."""
        txt = os.path.join(temp_dir, "img.txt")
        self._write_txt(
            txt,
            [
                "0 0.5 0.5",  # too few columns
                "0 0.5 0.5 0.2 0.2 X",  # too many columns
                "0 abc 0.5 0.2 0.2",  # non-numeric coord
                "0 0.5 0.5 0.2 0.2",  # valid
            ],
        )

        file_manager.load_bb_txt(txt, image_size=(100, 100))

        assert len(file_manager.segment_manager.segments) == 1

    def test_box_clamped_to_image_bounds(self, temp_dir, file_manager):
        """A box extending beyond image edges is clamped."""
        txt = os.path.join(temp_dir, "img.txt")
        # box centred at (0.95, 0.95) with large width/height
        self._write_txt(txt, ["0 0.95 0.95 0.5 0.5"])

        file_manager.load_bb_txt(txt, image_size=(100, 100))

        mask = file_manager.segment_manager.segments[0]["mask"]
        assert mask.shape == (100, 100)
        # should not extend outside image
        assert mask[99, 99]

    def test_empty_file_loads_no_segments(self, temp_dir, file_manager):
        """An empty TXT file produces no segments."""
        txt = os.path.join(temp_dir, "img.txt")
        self._write_txt(txt, [])

        file_manager.load_bb_txt(txt, image_size=(100, 100))

        assert len(file_manager.segment_manager.segments) == 0

    # --- fallback in load_existing_mask ---

    def test_load_existing_mask_prefers_npz(self, temp_dir, file_manager):
        """When both NPZ and TXT exist, NPZ is loaded."""
        base = os.path.join(temp_dir, "img")
        img_path = base + ".png"

        # Create NPZ with one class
        mask = np.zeros((100, 100, 1), dtype=np.uint8)
        mask[10:20, 10:20, 0] = 1
        np.savez_compressed(base + ".npz", mask=mask)

        # Create TXT with a different box
        self._write_txt(base + ".txt", ["0 0.8 0.8 0.1 0.1"])

        file_manager.load_existing_mask(img_path, image_size=(100, 100))

        segs = file_manager.segment_manager.segments
        assert len(segs) == 1
        # NPZ box is at (10:20, 10:20)
        assert segs[0]["mask"][15, 15]
        assert not segs[0]["mask"][80, 80]

    def test_load_existing_mask_falls_back_to_txt(self, temp_dir, file_manager):
        """When no NPZ exists, TXT is loaded."""
        base = os.path.join(temp_dir, "img")
        img_path = base + ".png"

        self._write_txt(base + ".txt", ["0 0.5 0.5 0.2 0.2"])

        file_manager.load_existing_mask(img_path, image_size=(100, 100))

        assert len(file_manager.segment_manager.segments) == 1

    def test_load_existing_mask_no_files(self, temp_dir, file_manager):
        """When neither NPZ nor TXT exists, no segments are loaded."""
        img_path = os.path.join(temp_dir, "img.png")

        file_manager.load_existing_mask(img_path, image_size=(100, 100))

        assert len(file_manager.segment_manager.segments) == 0


class TestNpzTxtCrossValidation:
    """Cross-validate that NPZ and TXT round-trips produce identical masks
    when the segments are purely rectangular (bounding boxes)."""

    @pytest.fixture
    def temp_dir(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    def _make_file_manager(self, segments=None, aliases=None):
        """Create a FileManager with pre-populated segments."""
        sm = SegmentManager()
        if aliases:
            sm.class_aliases = dict(aliases)
        fm = FileManager(sm)
        if segments:
            for seg in segments:
                sm.add_segment(seg)
        return fm

    def _rect_mask(self, h, w, y1, y2, x1, x2):
        mask = np.zeros((h, w), dtype=bool)
        mask[y1:y2, x1:x2] = True
        return mask

    def _rebuild_tensor(self, fm, image_size):
        """Rebuild a mask tensor from whatever segments are currently loaded."""
        class_order = fm.segment_manager.get_unique_class_ids()
        if not class_order:
            return np.zeros((*image_size, 0), dtype=np.uint8)
        return fm.segment_manager.create_final_mask_tensor(image_size, class_order)

    def test_single_box_roundtrip_match(self, temp_dir):
        """One rectangle: NPZ and TXT round-trips produce the same tensor."""
        image_size = (200, 300)
        h, w = image_size
        mask = self._rect_mask(h, w, 40, 80, 60, 120)

        # --- save both formats from the same segments ---
        fm_save = self._make_file_manager(
            segments=[{"mask": mask, "type": "Manual", "vertices": None, "class_id": 0}]
        )
        img_path = os.path.join(temp_dir, "img.png")
        class_order = [0]
        fm_save.save_npz(img_path, image_size, class_order)
        fm_save.save_bb_txt(img_path, image_size, class_order, ["0"])

        # --- load via NPZ ---
        fm_npz = self._make_file_manager()
        fm_npz.load_existing_mask(img_path, image_size=image_size)
        tensor_npz = self._rebuild_tensor(fm_npz, image_size)

        # --- load via TXT (remove NPZ so fallback triggers) ---
        os.remove(os.path.splitext(img_path)[0] + ".npz")
        fm_txt = self._make_file_manager()
        fm_txt.load_existing_mask(img_path, image_size=image_size)
        tensor_txt = self._rebuild_tensor(fm_txt, image_size)

        np.testing.assert_array_equal(tensor_npz, tensor_txt)

    def test_multiple_classes_roundtrip_match(self, temp_dir):
        """Multiple classes, non-overlapping boxes: NPZ == TXT."""
        image_size = (200, 200)
        h, w = image_size
        seg_a = {
            "mask": self._rect_mask(h, w, 10, 50, 10, 50),
            "type": "Manual",
            "vertices": None,
            "class_id": 0,
        }
        seg_b = {
            "mask": self._rect_mask(h, w, 100, 150, 100, 150),
            "type": "Manual",
            "vertices": None,
            "class_id": 1,
        }

        fm_save = self._make_file_manager(segments=[seg_a, seg_b])
        img_path = os.path.join(temp_dir, "img.png")
        class_order = [0, 1]
        fm_save.save_npz(img_path, image_size, class_order)
        fm_save.save_bb_txt(img_path, image_size, class_order, ["0", "1"])

        # NPZ load
        fm_npz = self._make_file_manager()
        fm_npz.load_existing_mask(img_path, image_size=image_size)
        tensor_npz = self._rebuild_tensor(fm_npz, image_size)

        # TXT load
        os.remove(os.path.splitext(img_path)[0] + ".npz")
        fm_txt = self._make_file_manager()
        fm_txt.load_existing_mask(img_path, image_size=image_size)
        tensor_txt = self._rebuild_tensor(fm_txt, image_size)

        np.testing.assert_array_equal(tensor_npz, tensor_txt)

    def test_same_class_multiple_boxes_roundtrip_match(self, temp_dir):
        """Two separate boxes sharing a class: NPZ == TXT."""
        image_size = (200, 200)
        h, w = image_size
        seg_a = {
            "mask": self._rect_mask(h, w, 10, 30, 10, 30),
            "type": "Manual",
            "vertices": None,
            "class_id": 0,
        }
        seg_b = {
            "mask": self._rect_mask(h, w, 100, 130, 100, 130),
            "type": "Manual",
            "vertices": None,
            "class_id": 0,
        }

        fm_save = self._make_file_manager(segments=[seg_a, seg_b])
        img_path = os.path.join(temp_dir, "img.png")
        class_order = [0]
        fm_save.save_npz(img_path, image_size, class_order)
        fm_save.save_bb_txt(img_path, image_size, class_order, ["0"])

        # NPZ load
        fm_npz = self._make_file_manager()
        fm_npz.load_existing_mask(img_path, image_size=image_size)
        tensor_npz = self._rebuild_tensor(fm_npz, image_size)

        # TXT load
        os.remove(os.path.splitext(img_path)[0] + ".npz")
        fm_txt = self._make_file_manager()
        fm_txt.load_existing_mask(img_path, image_size=image_size)
        tensor_txt = self._rebuild_tensor(fm_txt, image_size)

        np.testing.assert_array_equal(tensor_npz, tensor_txt)

    def test_alias_labels_roundtrip_match(self, temp_dir):
        """Class aliases used in TXT labels resolve to the same tensor as NPZ."""
        image_size = (100, 100)
        h, w = image_size
        aliases = {0: "cat", 1: "dog"}
        seg_a = {
            "mask": self._rect_mask(h, w, 5, 25, 5, 25),
            "type": "Manual",
            "vertices": None,
            "class_id": 0,
        }
        seg_b = {
            "mask": self._rect_mask(h, w, 60, 90, 60, 90),
            "type": "Manual",
            "vertices": None,
            "class_id": 1,
        }

        fm_save = self._make_file_manager(segments=[seg_a, seg_b], aliases=aliases)
        img_path = os.path.join(temp_dir, "img.png")
        class_order = [0, 1]
        fm_save.save_npz(img_path, image_size, class_order)
        fm_save.save_bb_txt(img_path, image_size, class_order, ["cat", "dog"])

        # NPZ load
        fm_npz = self._make_file_manager()
        fm_npz.load_existing_mask(img_path, image_size=image_size)
        tensor_npz = self._rebuild_tensor(fm_npz, image_size)

        # TXT load (with aliases set so labels resolve correctly)
        os.remove(os.path.splitext(img_path)[0] + ".npz")
        fm_txt = self._make_file_manager(aliases=aliases)
        fm_txt.load_existing_mask(img_path, image_size=image_size)
        tensor_txt = self._rebuild_tensor(fm_txt, image_size)

        np.testing.assert_array_equal(tensor_npz, tensor_txt)

    def test_overlapping_boxes_different_classes_roundtrip_match(self, temp_dir):
        """Overlapping boxes from different classes: both formats preserve the overlap."""
        image_size = (100, 100)
        h, w = image_size
        # Two overlapping rectangles, different classes
        seg_a = {
            "mask": self._rect_mask(h, w, 20, 60, 20, 60),
            "type": "Manual",
            "vertices": None,
            "class_id": 0,
        }
        seg_b = {
            "mask": self._rect_mask(h, w, 40, 80, 40, 80),
            "type": "Manual",
            "vertices": None,
            "class_id": 1,
        }

        fm_save = self._make_file_manager(segments=[seg_a, seg_b])
        img_path = os.path.join(temp_dir, "img.png")
        class_order = [0, 1]
        fm_save.save_npz(img_path, image_size, class_order)
        fm_save.save_bb_txt(img_path, image_size, class_order, ["0", "1"])

        # NPZ load
        fm_npz = self._make_file_manager()
        fm_npz.load_existing_mask(img_path, image_size=image_size)
        tensor_npz = self._rebuild_tensor(fm_npz, image_size)

        # TXT load
        os.remove(os.path.splitext(img_path)[0] + ".npz")
        fm_txt = self._make_file_manager()
        fm_txt.load_existing_mask(img_path, image_size=image_size)
        tensor_txt = self._rebuild_tensor(fm_txt, image_size)

        np.testing.assert_array_equal(tensor_npz, tensor_txt)

    @pytest.mark.parametrize(
        "image_size",
        [
            (7, 13),  # small odd x odd
            (1, 1),  # smallest possible
            (3, 3),  # tiny square
            (101, 77),  # odd height, odd width
            (480, 640),  # standard VGA
            (1080, 1920),  # full HD
            (333, 500),  # odd height, even width
            (256, 255),  # even height, odd width
            (1, 1000),  # single-row, wide
            (1000, 1),  # single-column, tall
        ],
        ids=[
            "7x13",
            "1x1",
            "3x3",
            "101x77",
            "480x640",
            "1080x1920",
            "333x500",
            "256x255",
            "1x1000",
            "1000x1",
        ],
    )
    def test_various_resolutions_roundtrip_match(self, temp_dir, image_size):
        """NPZ and TXT round-trips match across many image resolutions."""
        h, w = image_size

        # Place a box that fits within the image (centred, ~40% of each dim)
        bh = max(1, int(h * 0.4))
        bw = max(1, int(w * 0.4))
        y1 = (h - bh) // 2
        x1 = (w - bw) // 2
        mask = self._rect_mask(h, w, y1, y1 + bh, x1, x1 + bw)

        fm_save = self._make_file_manager(
            segments=[{"mask": mask, "type": "Manual", "vertices": None, "class_id": 0}]
        )
        img_path = os.path.join(temp_dir, "img.png")
        class_order = [0]
        fm_save.save_npz(img_path, image_size, class_order)
        fm_save.save_bb_txt(img_path, image_size, class_order, ["0"])

        # NPZ load
        fm_npz = self._make_file_manager()
        fm_npz.load_existing_mask(img_path, image_size=image_size)
        tensor_npz = self._rebuild_tensor(fm_npz, image_size)

        # TXT load
        os.remove(os.path.splitext(img_path)[0] + ".npz")
        fm_txt = self._make_file_manager()
        fm_txt.load_existing_mask(img_path, image_size=image_size)
        tensor_txt = self._rebuild_tensor(fm_txt, image_size)

        np.testing.assert_array_equal(tensor_npz, tensor_txt)

    @pytest.mark.parametrize(
        "image_size",
        [
            (51, 73),
            (199, 301),
            (479, 641),
        ],
        ids=["51x73", "199x301", "479x641"],
    )
    def test_odd_resolution_multiple_classes(self, temp_dir, image_size):
        """Multiple classes on odd-resolution images: NPZ == TXT."""
        h, w = image_size

        # Two non-overlapping boxes in different quadrants
        bh = max(1, h // 5)
        bw = max(1, w // 5)
        seg_a = {
            "mask": self._rect_mask(h, w, 1, 1 + bh, 1, 1 + bw),
            "type": "Manual",
            "vertices": None,
            "class_id": 0,
        }
        seg_b = {
            "mask": self._rect_mask(h, w, h - bh - 1, h - 1, w - bw - 1, w - 1),
            "type": "Manual",
            "vertices": None,
            "class_id": 1,
        }

        fm_save = self._make_file_manager(segments=[seg_a, seg_b])
        img_path = os.path.join(temp_dir, "img.png")
        class_order = [0, 1]
        fm_save.save_npz(img_path, image_size, class_order)
        fm_save.save_bb_txt(img_path, image_size, class_order, ["0", "1"])

        # NPZ load
        fm_npz = self._make_file_manager()
        fm_npz.load_existing_mask(img_path, image_size=image_size)
        tensor_npz = self._rebuild_tensor(fm_npz, image_size)

        # TXT load
        os.remove(os.path.splitext(img_path)[0] + ".npz")
        fm_txt = self._make_file_manager()
        fm_txt.load_existing_mask(img_path, image_size=image_size)
        tensor_txt = self._rebuild_tensor(fm_txt, image_size)

        np.testing.assert_array_equal(tensor_npz, tensor_txt)

    @pytest.mark.parametrize(
        "image_size",
        [
            (99, 99),
            (101, 201),
            (333, 777),
        ],
        ids=["99x99", "101x201", "333x777"],
    )
    def test_odd_resolution_edge_aligned_box(self, temp_dir, image_size):
        """Box touching image edges on odd-resolution images: NPZ == TXT."""
        h, w = image_size

        # Box spans full width, partial height (top-aligned)
        mask = self._rect_mask(h, w, 0, h // 3, 0, w)

        fm_save = self._make_file_manager(
            segments=[{"mask": mask, "type": "Manual", "vertices": None, "class_id": 0}]
        )
        img_path = os.path.join(temp_dir, "img.png")
        class_order = [0]
        fm_save.save_npz(img_path, image_size, class_order)
        fm_save.save_bb_txt(img_path, image_size, class_order, ["0"])

        # NPZ load
        fm_npz = self._make_file_manager()
        fm_npz.load_existing_mask(img_path, image_size=image_size)
        tensor_npz = self._rebuild_tensor(fm_npz, image_size)

        # TXT load
        os.remove(os.path.splitext(img_path)[0] + ".npz")
        fm_txt = self._make_file_manager()
        fm_txt.load_existing_mask(img_path, image_size=image_size)
        tensor_txt = self._rebuild_tensor(fm_txt, image_size)

        np.testing.assert_array_equal(tensor_npz, tensor_txt)


class TestLoadYoloSegTxt:
    """Tests for loading YOLO segmentation TXT files."""

    @pytest.fixture
    def temp_dir(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    @pytest.fixture
    def file_manager(self):
        sm = SegmentManager()
        return FileManager(sm)

    def _write_txt(self, path, lines):
        with open(path, "w") as f:
            for line in lines:
                f.write(line + "\n")

    def test_single_polygon_loaded(self, temp_dir, file_manager):
        """A single segmentation line loads as a polygon segment."""
        txt = os.path.join(temp_dir, "img_seg.txt")
        # Triangle in normalised coords
        self._write_txt(txt, ["0 0.2 0.2 0.8 0.2 0.5 0.8"])
        file_manager.load_yolo_seg_txt(txt, image_size=(100, 100))

        segs = file_manager.segment_manager.segments
        assert len(segs) == 1
        assert segs[0].get("vertices") is not None
        assert len(segs[0]["vertices"]) == 3

    def test_multiple_polygons(self, temp_dir, file_manager):
        """Multiple segmentation lines produce separate segments."""
        txt = os.path.join(temp_dir, "img_seg.txt")
        self._write_txt(
            txt,
            [
                "0 0.1 0.1 0.3 0.1 0.2 0.3",
                "1 0.6 0.6 0.9 0.6 0.75 0.9",
            ],
        )
        file_manager.load_yolo_seg_txt(txt, image_size=(100, 100))
        assert len(file_manager.segment_manager.segments) == 2

    def test_malformed_lines_skipped(self, temp_dir, file_manager):
        """Lines with too few coordinates or bad data are skipped."""
        txt = os.path.join(temp_dir, "img_seg.txt")
        self._write_txt(
            txt,
            [
                "0 0.1 0.1",  # too few
                "0 abc 0.1 0.3 0.1 0.2 0.3",  # non-numeric
                "0 0.2 0.2 0.8 0.2 0.5 0.8",  # valid
            ],
        )
        file_manager.load_yolo_seg_txt(txt, image_size=(100, 100))
        assert len(file_manager.segment_manager.segments) == 1


class TestLoadCocoJson:
    """Tests for loading COCO JSON files."""

    @pytest.fixture
    def temp_dir(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    @pytest.fixture
    def file_manager(self):
        sm = SegmentManager()
        return FileManager(sm)

    def _write_coco(self, path, data):
        import json

        with open(path, "w") as f:
            json.dump(data, f)

    def test_polygon_annotations_loaded(self, temp_dir, file_manager):
        """Polygon segmentation annotations are rasterised."""
        coco_path = os.path.join(temp_dir, "img_coco.json")
        self._write_coco(
            coco_path,
            {
                "images": [
                    {"id": 1, "file_name": "img.png", "width": 100, "height": 100}
                ],
                "annotations": [
                    {
                        "id": 1,
                        "image_id": 1,
                        "category_id": 0,
                        "bbox": [20, 20, 20, 20],
                        "area": 400,
                        "segmentation": [[20, 20, 40, 20, 40, 40, 20, 40]],
                        "iscrowd": 0,
                    }
                ],
                "categories": [{"id": 0, "name": "car", "supercategory": "vehicle"}],
            },
        )
        file_manager.load_coco_json(coco_path, image_size=(100, 100))
        segs = file_manager.segment_manager.segments
        assert len(segs) == 1
        assert segs[0]["mask"][30, 30]
        # Alias should have supercategory
        assert file_manager.segment_manager.class_aliases[0] == "car.vehicle"

    def test_bbox_only_fallback(self, temp_dir, file_manager):
        """Annotations without segmentation fall back to bbox."""
        coco_path = os.path.join(temp_dir, "img_coco.json")
        self._write_coco(
            coco_path,
            {
                "images": [
                    {"id": 1, "file_name": "img.png", "width": 100, "height": 100}
                ],
                "annotations": [
                    {
                        "id": 1,
                        "image_id": 1,
                        "category_id": 0,
                        "bbox": [10, 10, 30, 30],
                        "area": 900,
                        "iscrowd": 0,
                    }
                ],
                "categories": [{"id": 0, "name": "box", "supercategory": "box"}],
            },
        )
        file_manager.load_coco_json(coco_path, image_size=(100, 100))
        segs = file_manager.segment_manager.segments
        assert len(segs) == 1
        assert segs[0]["mask"][20, 20]

    def test_category_mapping(self, temp_dir, file_manager):
        """Category IDs are preserved from the COCO file."""
        coco_path = os.path.join(temp_dir, "img_coco.json")
        self._write_coco(
            coco_path,
            {
                "images": [
                    {"id": 1, "file_name": "img.png", "width": 100, "height": 100}
                ],
                "annotations": [
                    {
                        "id": 1,
                        "image_id": 1,
                        "category_id": 5,
                        "bbox": [10, 10, 20, 20],
                        "area": 400,
                        "segmentation": [[10, 10, 30, 10, 30, 30, 10, 30]],
                        "iscrowd": 0,
                    }
                ],
                "categories": [{"id": 5, "name": "bike", "supercategory": "bike"}],
            },
        )
        file_manager.load_coco_json(coco_path, image_size=(100, 100))
        assert file_manager.segment_manager.segments[0]["class_id"] == 5


class TestFallbackChain:
    """Tests for the load_existing_mask fallback chain."""

    @pytest.fixture
    def temp_dir(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    def _write_txt(self, path, lines):
        with open(path, "w") as f:
            for line in lines:
                f.write(line + "\n")

    def _write_coco(self, path, data):
        import json

        with open(path, "w") as f:
            json.dump(data, f)

    def test_seg_preferred_over_det(self, temp_dir):
        """YOLO seg is preferred over YOLO det when both exist."""
        base = os.path.join(temp_dir, "img")
        img_path = base + ".png"

        # Write both files
        self._write_txt(base + ".txt", ["0 0.5 0.5 0.2 0.2"])
        self._write_txt(base + "_seg.txt", ["0 0.2 0.2 0.8 0.2 0.5 0.8"])

        fm = FileManager(SegmentManager())
        fm.load_existing_mask(img_path, image_size=(100, 100))
        segs = fm.segment_manager.segments
        assert len(segs) == 1
        # Seg loads produce vertices, det does not
        assert segs[0].get("vertices") is not None

    def test_coco_preferred_over_det(self, temp_dir):
        """COCO JSON is preferred over YOLO det."""
        base = os.path.join(temp_dir, "img")
        img_path = base + ".png"

        self._write_txt(base + ".txt", ["0 0.5 0.5 0.2 0.2"])
        self._write_coco(
            base + "_coco.json",
            {
                "images": [
                    {"id": 1, "file_name": "img.png", "width": 100, "height": 100}
                ],
                "annotations": [
                    {
                        "id": 1,
                        "image_id": 1,
                        "category_id": 0,
                        "bbox": [20, 20, 20, 20],
                        "area": 400,
                        "segmentation": [[20, 20, 40, 20, 40, 40, 20, 40]],
                        "iscrowd": 0,
                    }
                ],
                "categories": [{"id": 0, "name": "obj", "supercategory": "obj"}],
            },
        )

        fm = FileManager(SegmentManager())
        fm.load_existing_mask(img_path, image_size=(100, 100))
        segs = fm.segment_manager.segments
        assert len(segs) == 1
        # COCO produces vertices from polygon
        assert segs[0].get("vertices") is not None

    def test_npz_preferred_over_all(self, temp_dir):
        """NPZ is always preferred when it exists."""
        base = os.path.join(temp_dir, "img")
        img_path = base + ".png"

        mask = np.zeros((100, 100, 1), dtype=np.uint8)
        mask[10:20, 10:20, 0] = 1
        np.savez_compressed(base + ".npz", mask=mask)

        # Also create seg and det
        self._write_txt(base + "_seg.txt", ["0 0.5 0.5 0.8 0.5 0.65 0.8"])
        self._write_txt(base + ".txt", ["0 0.5 0.5 0.2 0.2"])

        fm = FileManager(SegmentManager())
        fm.load_existing_mask(img_path, image_size=(100, 100))
        segs = fm.segment_manager.segments
        assert len(segs) == 1
        # NPZ region is at 10:20, seg/det are elsewhere
        assert segs[0]["mask"][15, 15]
        assert not segs[0]["mask"][50, 50]


class TestSixteenBitTiff:
    """Verify that 16-bit TIFF files can be loaded and processed without errors.

    The display pipeline converts to 8-bit for Qt, but the spatial dimensions
    must be preserved so that masks and bounding boxes remain correct.
    """

    @pytest.fixture
    def temp_dir(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            yield tmpdir

    def _make_file_manager(self, segments=None):
        sm = SegmentManager()
        fm = FileManager(sm)
        if segments:
            for seg in segments:
                sm.add_segment(seg)
        return fm

    def _write_16bit_tiff(self, path, h, w, channels=3):
        """Write a synthetic 16-bit TIFF with values spanning the full range."""
        if channels == 3:
            img = np.zeros((h, w, 3), dtype=np.uint16)
            img[:, :, 0] = np.linspace(0, 65535, w, dtype=np.uint16)
            img[:, :, 1] = np.linspace(0, 32000, w, dtype=np.uint16)
            img[:, :, 2] = 40000
        else:
            img = np.full((h, w), 40000, dtype=np.uint16)
        cv2.imwrite(path, img)
        return img

    # --- cv2 loading preserves dimensions ---

    @pytest.mark.parametrize(
        "h,w",
        [(100, 100), (101, 77), (480, 640), (1, 1), (333, 501)],
        ids=["100x100", "101x77", "480x640", "1x1", "333x501"],
    )
    def test_cv2_loads_16bit_tiff_correct_shape(self, temp_dir, h, w):
        """cv2.imread (default flags) loads a 16-bit TIFF with correct spatial dims."""
        tiff_path = os.path.join(temp_dir, "img.tiff")
        self._write_16bit_tiff(tiff_path, h, w)

        loaded = cv2.imread(tiff_path)
        assert loaded is not None, "cv2.imread returned None for 16-bit TIFF"
        assert loaded.shape[:2] == (h, w)
        assert loaded.dtype == np.uint8  # default imread converts to 8-bit

    def test_cv2_loads_16bit_grayscale_tiff(self, temp_dir):
        """16-bit single-channel TIFF loads without error."""
        tiff_path = os.path.join(temp_dir, "gray.tiff")
        self._write_16bit_tiff(tiff_path, 50, 75, channels=1)

        loaded = cv2.imread(tiff_path)
        assert loaded is not None
        assert loaded.shape[:2] == (50, 75)

    # --- mask / bb round-trip on 16-bit TIFF dimensions ---

    def test_npz_txt_crossval_on_16bit_tiff_dimensions(self, temp_dir):
        """Masks saved/loaded at 16-bit TIFF dimensions match between NPZ and TXT."""
        tiff_path = os.path.join(temp_dir, "img.tiff")
        self._write_16bit_tiff(tiff_path, 101, 203)

        loaded = cv2.imread(tiff_path)
        h, w = loaded.shape[:2]
        image_size = (h, w)

        mask = np.zeros((h, w), dtype=bool)
        mask[10:50, 20:80] = True

        fm_save = self._make_file_manager(
            segments=[{"mask": mask, "type": "Manual", "vertices": None, "class_id": 0}]
        )
        # Use the tiff path as the image path so .npz/.txt sit beside it
        fm_save.save_npz(tiff_path, image_size, [0])
        fm_save.save_bb_txt(tiff_path, image_size, [0], ["0"])

        # NPZ load
        fm_npz = self._make_file_manager()
        fm_npz.load_existing_mask(tiff_path, image_size=image_size)
        t_npz = fm_npz.segment_manager.create_final_mask_tensor(image_size, [0])

        # TXT load
        os.remove(os.path.splitext(tiff_path)[0] + ".npz")
        fm_txt = self._make_file_manager()
        fm_txt.load_existing_mask(tiff_path, image_size=image_size)
        t_txt = fm_txt.segment_manager.create_final_mask_tensor(image_size, [0])

        np.testing.assert_array_equal(t_npz, t_txt)

    # --- full load_image_by_path simulation (cv2 path) ---

    def test_simulated_load_image_by_path_16bit(self, temp_dir):
        """Simulate the cv2-based loading path with a 16-bit TIFF.

        This mirrors file_navigation_manager.load_image_by_path lines 282-309
        to verify no crash occurs and a valid RGB array is produced.
        """
        tiff_path = os.path.join(temp_dir, "img.tiff")
        self._write_16bit_tiff(tiff_path, 77, 133)

        # --- replicate the load_image_by_path logic ---
        original_image = cv2.imread(tiff_path)
        assert original_image is not None

        if len(original_image.shape) == 3:
            original_image = cv2.cvtColor(original_image, cv2.COLOR_BGR2RGB)

        height, width = original_image.shape[:2]
        assert (height, width) == (77, 133)

        # bytes_per_line calculation used by QImage construction
        bytes_per_line = 3 * width if len(original_image.shape) == 3 else width
        assert bytes_per_line == 3 * 133

        # Verify the data is contiguous and the right dtype for QImage
        assert original_image.dtype == np.uint8
        assert original_image.data.contiguous or original_image.flags["C_CONTIGUOUS"]

    # --- IMREAD_UNCHANGED preserves 16-bit ---

    def test_imread_unchanged_preserves_16bit(self, temp_dir):
        """cv2.IMREAD_UNCHANGED keeps uint16 dtype and full range."""
        tiff_path = os.path.join(temp_dir, "img.tiff")
        self._write_16bit_tiff(tiff_path, 60, 80)

        loaded = cv2.imread(tiff_path, cv2.IMREAD_UNCHANGED)
        assert loaded is not None
        assert loaded.dtype == np.uint16
        assert loaded.shape[:2] == (60, 80)
        # Values above 255 prove the data isn't truncated
        assert loaded.max() > 255

    def test_16bit_to_8bit_conversion_preserves_shape(self, temp_dir):
        """Converting 16-bit to 8-bit for display preserves spatial dimensions."""
        tiff_path = os.path.join(temp_dir, "img.tiff")
        self._write_16bit_tiff(tiff_path, 101, 203)

        raw = cv2.imread(tiff_path, cv2.IMREAD_UNCHANGED)
        display = np.clip(raw / 256, 0, 255).astype(np.uint8)

        assert display.shape == raw.shape
        assert display.dtype == np.uint8
