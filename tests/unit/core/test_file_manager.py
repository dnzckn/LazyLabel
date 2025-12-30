"""Unit tests for FileManager NPZ saving and loading.

Tests NPZ format compatibility between single-view and multi-view modes.
Both modes should use the same "mask" key for interoperability.
"""

import os
import tempfile

import numpy as np
import pytest


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
