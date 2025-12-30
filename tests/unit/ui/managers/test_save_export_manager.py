"""Tests for SaveExportManager functionality."""

from unittest.mock import MagicMock

import numpy as np
import pytest

from lazylabel.ui.managers.save_export_manager import SaveExportManager


@pytest.fixture
def mock_main_window():
    """Create a mock MainWindow with required attributes."""
    mw = MagicMock()
    mw.fragment_threshold = 50  # 50% threshold
    mw.segment_manager = MagicMock()
    mw.file_manager = MagicMock()
    mw.crop_manager = MagicMock()
    mw.control_panel = MagicMock()
    return mw


@pytest.fixture
def save_export_manager(mock_main_window):
    """Create SaveExportManager with mocked MainWindow."""
    return SaveExportManager(mock_main_window)


class TestApplyFragmentThreshold:
    """Tests for the apply_fragment_threshold method."""

    def test_apply_fragment_threshold_filters_small_fragments(
        self, save_export_manager, mock_main_window
    ):
        """Test that small fragments are filtered out based on threshold."""
        # Create a mask with one large region and one small region
        mask = np.zeros((100, 100), dtype=bool)
        # Large region (50x50 = 2500 pixels)
        mask[10:60, 10:60] = True
        # Small region (10x10 = 100 pixels, which is 4% of large region)
        mask[70:80, 70:80] = True

        # Set threshold to 50% - should filter out the small region
        mock_main_window.fragment_threshold = 50

        result = save_export_manager.apply_fragment_threshold(mask)

        assert result is not None
        # Large region should remain
        assert result[30, 30]  # Center of large region
        # Small region should be filtered out
        assert not result[75, 75]  # Center of small region

    def test_apply_fragment_threshold_keeps_all_with_zero_threshold(
        self, save_export_manager, mock_main_window
    ):
        """Test that zero threshold keeps all fragments."""
        mask = np.zeros((100, 100), dtype=bool)
        mask[10:60, 10:60] = True  # Large region
        mask[70:80, 70:80] = True  # Small region

        mock_main_window.fragment_threshold = 0

        result = save_export_manager.apply_fragment_threshold(mask)

        assert result is not None
        # Both regions should remain
        assert result[30, 30]
        assert result[75, 75]

    def test_apply_fragment_threshold_returns_none_for_empty_mask(
        self, save_export_manager, mock_main_window
    ):
        """Test that empty mask returns None."""
        mask = np.zeros((100, 100), dtype=bool)

        result = save_export_manager.apply_fragment_threshold(mask)

        assert result is None

    def test_apply_fragment_threshold_returns_none_for_none_input(
        self, save_export_manager
    ):
        """Test that None input returns None."""
        result = save_export_manager.apply_fragment_threshold(None)

        assert result is None

    def test_apply_fragment_threshold_preserves_mask_shape(
        self, save_export_manager, mock_main_window
    ):
        """Test that output mask has same shape as input."""
        mask = np.zeros((150, 200), dtype=bool)
        mask[50:100, 50:150] = True

        mock_main_window.fragment_threshold = 0

        result = save_export_manager.apply_fragment_threshold(mask)

        assert result is not None
        assert result.shape == mask.shape

    def test_apply_fragment_threshold_returns_boolean_mask(
        self, save_export_manager, mock_main_window
    ):
        """Test that output is a boolean mask."""
        mask = np.zeros((50, 50), dtype=bool)
        mask[10:40, 10:40] = True

        mock_main_window.fragment_threshold = 0

        result = save_export_manager.apply_fragment_threshold(mask)

        assert result is not None
        assert result.dtype == bool

    def test_apply_fragment_threshold_high_threshold_filters_all_but_largest(
        self, save_export_manager, mock_main_window
    ):
        """Test that high threshold keeps only the largest fragment."""
        mask = np.zeros((100, 100), dtype=bool)
        # Largest region (40x40 = 1600 pixels)
        mask[5:45, 5:45] = True
        # Medium region (20x20 = 400 pixels, 25% of largest)
        mask[50:70, 5:25] = True
        # Small region (10x10 = 100 pixels, 6.25% of largest)
        mask[80:90, 80:90] = True

        # Set threshold to 50% - should keep only largest
        mock_main_window.fragment_threshold = 50

        result = save_export_manager.apply_fragment_threshold(mask)

        assert result is not None
        # Only largest should remain
        assert result[25, 25]  # Center of largest
        assert not result[60, 15]  # Center of medium
        assert not result[85, 85]  # Center of small
