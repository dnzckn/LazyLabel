"""Unit tests for KeyboardEventManager.

Tests keyboard event handling including escape key behavior
in both single-view and multi-view modes.
"""

from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def mock_main_window():
    """Create a mock MainWindow for testing."""
    mw = MagicMock()
    mw.view_mode = "single"
    mw.right_panel = MagicMock()
    mw.viewer = MagicMock()
    mw.ai_bbox_preview_mask = None
    return mw


@pytest.fixture
def mock_main_window_multi_view():
    """Create a mock MainWindow in multi-view mode."""
    mw = MagicMock()
    mw.view_mode = "multi"

    # Multi-view tables
    table0 = MagicMock()
    table1 = MagicMock()
    mw.multi_view_segment_tables = [table0, table1]

    # Multi-view viewers
    viewer0 = MagicMock()
    viewer1 = MagicMock()
    mw.multi_view_viewers = [viewer0, viewer1]

    # Coordinator
    mw.multi_view_coordinator = MagicMock()
    mw.multi_view_coordinator.active_viewer_idx = 0

    mw.ai_bbox_preview_mask = None
    return mw


@pytest.fixture
def keyboard_manager(mock_main_window):
    """Create KeyboardEventManager with mock main window."""
    from lazylabel.ui.managers.keyboard_event_manager import KeyboardEventManager

    return KeyboardEventManager(mock_main_window)


@pytest.fixture
def keyboard_manager_multi_view(mock_main_window_multi_view):
    """Create KeyboardEventManager in multi-view mode."""
    from lazylabel.ui.managers.keyboard_event_manager import KeyboardEventManager

    return KeyboardEventManager(mock_main_window_multi_view)


class TestEscapeKeySingleView:
    """Tests for escape key handling in single-view mode."""

    def test_escape_clears_right_panel_selections(self, keyboard_manager):
        """Test that escape clears right panel selections in single-view."""
        keyboard_manager.handle_escape_press()

        keyboard_manager.mw.right_panel.clear_selections.assert_called_once()

    def test_escape_clears_all_points(self, keyboard_manager):
        """Test that escape clears all points."""
        with patch.object(keyboard_manager, "clear_all_points") as mock_clear:
            keyboard_manager.handle_escape_press()
            mock_clear.assert_called_once()

    def test_escape_sets_focus_to_viewer(self, keyboard_manager):
        """Test that escape sets focus to main viewer."""
        keyboard_manager.handle_escape_press()

        keyboard_manager.mw.viewer.setFocus.assert_called_once()


class TestEscapeKeyMultiView:
    """Tests for escape key handling in multi-view mode."""

    def test_escape_clears_multi_view_table_selections(
        self, keyboard_manager_multi_view
    ):
        """Test that escape clears all multi-view segment table selections."""
        keyboard_manager_multi_view.handle_escape_press()

        # Both tables should have clearSelection called
        for table in keyboard_manager_multi_view.mw.multi_view_segment_tables:
            table.clearSelection.assert_called_once()

    def test_escape_does_not_clear_right_panel_in_multi_view(
        self, keyboard_manager_multi_view
    ):
        """Test that escape doesn't call right_panel.clear_selections in multi-view."""
        keyboard_manager_multi_view.handle_escape_press()

        # right_panel.clear_selections should NOT be called in multi-view mode
        assert (
            not hasattr(keyboard_manager_multi_view.mw, "right_panel")
            or not keyboard_manager_multi_view.mw.right_panel.clear_selections.called
        )

    def test_escape_clears_highlights_in_multi_view(self, keyboard_manager_multi_view):
        """Test that escape clears highlights for all viewers."""
        keyboard_manager_multi_view.handle_escape_press()

        # Should call _clear_multi_view_highlights for each viewer
        mw = keyboard_manager_multi_view.mw
        assert mw._clear_multi_view_highlights.call_count == 2

    def test_escape_sets_focus_to_active_viewer(self, keyboard_manager_multi_view):
        """Test that escape sets focus to the active multi-view viewer."""
        keyboard_manager_multi_view.mw.multi_view_coordinator.active_viewer_idx = 1

        keyboard_manager_multi_view.handle_escape_press()

        # Should set focus on viewer 1 (the active one)
        keyboard_manager_multi_view.mw.multi_view_viewers[1].setFocus.assert_called()

    def test_escape_clears_bbox_preview(self, keyboard_manager_multi_view):
        """Test that escape clears bbox preview state."""
        keyboard_manager_multi_view.mw.ai_bbox_preview_mask = "some_mask"
        keyboard_manager_multi_view.mw.ai_bbox_preview_rect = (10, 20, 100, 200)
        keyboard_manager_multi_view.mw.preview_mask_item = MagicMock()
        keyboard_manager_multi_view.mw.viewer = MagicMock()

        keyboard_manager_multi_view.handle_escape_press()

        assert keyboard_manager_multi_view.mw.ai_bbox_preview_mask is None
        assert keyboard_manager_multi_view.mw.ai_bbox_preview_rect is None
