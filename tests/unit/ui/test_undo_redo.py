"""Unit tests for the undo and redo functionality."""

import pytest
from unittest.mock import MagicMock, patch
from PyQt6.QtCore import QPointF
from lazylabel.ui.main_window import MainWindow


class TestUndoRedo:
    """Tests for the undo and redo functionality."""

    @pytest.fixture
    def mock_main_window(self, qtbot):
        """Create a mocked MainWindow with necessary attributes."""
        with (
            patch("lazylabel.ui.main_window.MainWindow._setup_ui"),
            patch("lazylabel.ui.main_window.MainWindow._setup_model"),
            patch("lazylabel.ui.main_window.MainWindow._setup_connections"),
            patch("lazylabel.ui.main_window.MainWindow._setup_shortcuts"),
            patch("lazylabel.ui.main_window.MainWindow._load_settings"),
        ):

            window = MainWindow()
            qtbot.addWidget(window)

            # Mock necessary methods and attributes
            window._show_notification = MagicMock()
            window._show_warning_notification = MagicMock()
            window._update_all_lists = MagicMock()
            window.right_panel = MagicMock()
            window.right_panel.clear_selections = MagicMock()
            window.segment_manager = MagicMock()
            window._update_polygon_item = MagicMock()
            window._display_edit_handles = MagicMock()
            window._highlight_selected_segments = MagicMock()

            return window

    def test_undo_redo_add_segment(self, mock_main_window):
        """Test undoing and redoing add segment action."""
        # Setup
        mock_main_window.action_history = [{"type": "add_segment", "segment_index": 0}]
        mock_main_window.redo_history = []
        mock_main_window.segment_manager.segments = [
            {"type": "Polygon", "vertices": []}
        ]

        # Mock segment_manager.delete_segments to store the segment data
        def mock_delete_segments(indices):
            # The action has already been moved to redo_history by this point
            if mock_main_window.redo_history:
                mock_main_window.redo_history[-1]["segment_data"] = (
                    mock_main_window.segment_manager.segments[0].copy()
                )
            mock_main_window.segment_manager.segments = []

        mock_main_window.segment_manager.delete_segments = mock_delete_segments

        # Test undo
        mock_main_window._undo_last_action()

        # Verify undo
        assert len(mock_main_window.action_history) == 0
        assert len(mock_main_window.redo_history) == 1
        assert mock_main_window.redo_history[0]["type"] == "add_segment"
        mock_main_window._show_notification.assert_called_once_with(
            "Undid: Add Segment"
        )

        # Reset mocks
        mock_main_window._show_notification.reset_mock()

        # Mock segment_manager.add_segment for redo
        def mock_add_segment(segment_data):
            mock_main_window.segment_manager.segments.append(segment_data)

        mock_main_window.segment_manager.add_segment = mock_add_segment

        # Test redo
        mock_main_window._redo_last_action()

        # Verify redo
        assert len(mock_main_window.redo_history) == 0
        assert len(mock_main_window.action_history) == 1
        assert mock_main_window.action_history[0]["type"] == "add_segment"
        mock_main_window._show_notification.assert_called_once_with(
            "Redid: Add Segment"
        )
        mock_main_window._update_all_lists.assert_called()

    def test_undo_redo_move_vertex(self, mock_main_window):
        """Test undoing and redoing move vertex action."""
        # Setup
        old_pos = QPointF(10, 10)
        new_pos = QPointF(20, 20)
        mock_main_window.action_history = [
            {
                "type": "move_vertex",
                "segment_index": 0,
                "vertex_index": 0,
                "old_pos": old_pos,
                "new_pos": new_pos,
            }
        ]
        mock_main_window.redo_history = []
        mock_main_window.segment_manager.segments = [
            {"type": "Polygon", "vertices": [new_pos]}
        ]

        # Test undo
        mock_main_window._undo_last_action()

        # Verify undo
        assert len(mock_main_window.action_history) == 0
        assert len(mock_main_window.redo_history) == 1
        assert mock_main_window.segment_manager.segments[0]["vertices"][0] == old_pos
        mock_main_window._update_polygon_item.assert_called_once_with(0)
        mock_main_window._display_edit_handles.assert_called_once()
        mock_main_window._highlight_selected_segments.assert_called_once()
        mock_main_window._show_notification.assert_called_once_with(
            "Undid: Move Vertex"
        )

        # Reset mocks
        mock_main_window._show_notification.reset_mock()
        mock_main_window._update_polygon_item.reset_mock()
        mock_main_window._display_edit_handles.reset_mock()
        mock_main_window._highlight_selected_segments.reset_mock()

        # Test redo
        mock_main_window._redo_last_action()

        # Verify redo
        assert len(mock_main_window.redo_history) == 0
        assert len(mock_main_window.action_history) == 1
        assert mock_main_window.segment_manager.segments[0]["vertices"][0] == new_pos
        mock_main_window._update_polygon_item.assert_called_once_with(0)
        mock_main_window._display_edit_handles.assert_called_once()
        mock_main_window._highlight_selected_segments.assert_called_once()
        mock_main_window._show_notification.assert_called_once_with(
            "Redid: Move Vertex"
        )

    def test_nothing_to_undo_redo(self, mock_main_window):
        """Test behavior when there's nothing to undo or redo."""
        # Setup
        mock_main_window.action_history = []
        mock_main_window.redo_history = []

        # Test undo with empty history
        mock_main_window._undo_last_action()
        mock_main_window._show_notification.assert_called_once_with("Nothing to undo.")

        # Reset mock
        mock_main_window._show_notification.reset_mock()

        # Test redo with empty history
        mock_main_window._redo_last_action()
        mock_main_window._show_notification.assert_called_once_with("Nothing to redo.")

    def test_reset_state_clears_histories(self, mock_main_window):
        """Test that reset_state clears both action and redo histories."""
        # Setup
        mock_main_window.action_history = [{"type": "add_segment"}]
        mock_main_window.redo_history = [{"type": "add_segment"}]
        mock_main_window.clear_all_points = MagicMock()
        mock_main_window.segment_manager.clear = MagicMock()
        mock_main_window.viewer = MagicMock()
        mock_main_window.viewer.scene().items.return_value = []
        mock_main_window.segment_items = MagicMock()
        mock_main_window.highlight_items = MagicMock()

        # Call reset_state
        mock_main_window._reset_state()

        # Verify histories are cleared
        assert len(mock_main_window.action_history) == 0
        assert len(mock_main_window.redo_history) == 0
