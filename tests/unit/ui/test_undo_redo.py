"""Unit tests for the undo and redo functionality."""

from unittest.mock import MagicMock, patch

import pytest

from lazylabel.core import UndoRedoManager
from lazylabel.ui.main_window import MainWindow


class TestUndoRedo:
    """Tests for the undo and redo functionality."""

    @pytest.fixture
    def mock_main_window(self, qtbot):
        """Create a mocked MainWindow with necessary attributes."""
        with (
            patch("lazylabel.ui.main_window.MainWindow._setup_ui"),
            patch("lazylabel.ui.main_window.MainWindow._setup_model_manager"),
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
            window._update_lists_incremental = MagicMock()
            window.right_panel = MagicMock()
            window.right_panel.clear_selections = MagicMock()
            window.segment_manager = MagicMock()
            window._update_polygon_item = MagicMock()
            window._display_edit_handles = MagicMock()
            window._highlight_selected_segments = MagicMock()

            # Initialize undo/redo manager (normally done in _setup_ui)
            window.undo_redo_manager = UndoRedoManager(window)

            # Initialize crop_manager mock (normally done in _setup_ui)
            window.crop_manager = MagicMock()

            # Initialize panel_popout_manager mock (normally done in _setup_ui)
            window.panel_popout_manager = MagicMock()

            # Initialize segment_display_manager mock (normally done in _setup_ui)
            window.segment_display_manager = MagicMock()

            return window

    def test_undo_redo_add_segment(self, mock_main_window):
        """Test undoing and redoing add segment action."""
        # Setup - use undo_redo_manager directly
        undo_redo = mock_main_window.undo_redo_manager
        undo_redo.action_history = [{"type": "add_segment", "segment_index": 0}]
        undo_redo.redo_history = []
        mock_main_window.segment_manager.segments = [
            {"type": "Polygon", "vertices": []}
        ]

        # Mock segment_manager.delete_segments to store the segment data
        def mock_delete_segments(indices):
            # The action has already been moved to redo_history by this point
            if undo_redo.redo_history:
                undo_redo.redo_history[-1]["segment_data"] = (
                    mock_main_window.segment_manager.segments[0].copy()
                )
            mock_main_window.segment_manager.segments = []

        mock_main_window.segment_manager.delete_segments = mock_delete_segments

        # Test undo
        undo_redo.undo()

        # Verify undo
        assert len(undo_redo.action_history) == 0
        assert len(undo_redo.redo_history) == 1
        assert undo_redo.redo_history[0]["type"] == "add_segment"
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
        undo_redo.redo()

        # Verify redo
        assert len(undo_redo.redo_history) == 0
        assert len(undo_redo.action_history) == 1
        assert undo_redo.action_history[0]["type"] == "add_segment"
        mock_main_window._show_notification.assert_called_once_with(
            "Redid: Add Segment"
        )
        # Redo now uses incremental update for better performance
        mock_main_window._update_lists_incremental.assert_called()

    def test_undo_redo_move_vertex(self, mock_main_window):
        """Test undoing and redoing move vertex action."""
        # Setup
        undo_redo = mock_main_window.undo_redo_manager
        old_pos = [10, 10]
        new_pos = [20, 20]
        undo_redo.action_history = [
            {
                "type": "move_vertex",
                "segment_index": 0,
                "vertex_index": 0,
                "old_pos": old_pos,
                "new_pos": new_pos,
            }
        ]
        undo_redo.redo_history = []
        mock_main_window.segment_manager.segments = [
            {"type": "Polygon", "vertices": [new_pos]}
        ]

        # Test undo
        undo_redo.undo()

        # Verify undo
        assert len(undo_redo.action_history) == 0
        assert len(undo_redo.redo_history) == 1
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
        undo_redo.redo()

        # Verify redo
        assert len(undo_redo.redo_history) == 0
        assert len(undo_redo.action_history) == 1
        assert mock_main_window.segment_manager.segments[0]["vertices"][0] == new_pos
        mock_main_window._update_polygon_item.assert_called_once_with(0)
        mock_main_window._display_edit_handles.assert_called_once()
        mock_main_window._highlight_selected_segments.assert_called_once()
        mock_main_window._show_notification.assert_called_once_with(
            "Redid: Move Vertex"
        )

    def test_undo_redo_move_bbox_vertex(self, mock_main_window):
        """Test undoing and redoing move vertex action for a bounding box."""
        # Setup: A bounding box is a polygon with 4 vertices
        undo_redo = mock_main_window.undo_redo_manager
        old_bbox_vertices = [[10, 10], [100, 10], [100, 100], [10, 100]]

        # Simulate initial state where a bbox exists
        mock_main_window.segment_manager.segments = [
            {"type": "Polygon", "vertices": old_bbox_vertices}
        ]

        # Simulate a move_vertex action for one of the bbox vertices
        # Let's say vertex_index 2 (bottom-right) is moved
        moved_vertex_old_pos = old_bbox_vertices[2]
        moved_vertex_new_pos = [
            105,
            105,
        ]  # Slightly different from new_bbox_vertices for a single vertex move

        undo_redo.action_history = [
            {
                "type": "move_vertex",
                "segment_index": 0,
                "vertex_index": 2,
                "old_pos": moved_vertex_old_pos,
                "new_pos": moved_vertex_new_pos,
            }
        ]
        undo_redo.redo_history = []

        # Before undo, the segment should reflect the new_pos for the moved vertex
        mock_main_window.segment_manager.segments[0]["vertices"][2] = (
            moved_vertex_new_pos
        )

        # Test undo
        undo_redo.undo()

        # Verify undo
        assert len(undo_redo.action_history) == 0
        assert len(undo_redo.redo_history) == 1
        # Check if the specific vertex reverted to its old position
        assert (
            mock_main_window.segment_manager.segments[0]["vertices"][2]
            == moved_vertex_old_pos
        )
        mock_main_window._update_polygon_item.assert_called_once_with(0)
        mock_main_window._display_edit_handles.assert_called_once()
        mock_main_window._highlight_selected_segments.assert_called_once()
        mock_main_window._show_notification.assert_called_once_with(
            "Undid: Move Vertex"
        )

        # Reset mocks for redo
        mock_main_window._show_notification.reset_mock()
        mock_main_window._update_polygon_item.reset_mock()
        mock_main_window._display_edit_handles.reset_mock()
        mock_main_window._highlight_selected_segments.reset_mock()

        # Test redo
        undo_redo.redo()

        # Verify redo
        assert len(undo_redo.redo_history) == 0
        assert len(undo_redo.action_history) == 1
        # Check if the specific vertex moved back to its new position
        assert (
            mock_main_window.segment_manager.segments[0]["vertices"][2]
            == moved_vertex_new_pos
        )
        mock_main_window._update_polygon_item.assert_called_once_with(0)
        mock_main_window._display_edit_handles.assert_called_once()
        mock_main_window._highlight_selected_segments.assert_called_once()
        mock_main_window._show_notification.assert_called_once_with(
            "Redid: Move Vertex"
        )

    def test_nothing_to_undo_redo(self, mock_main_window):
        """Test behavior when there's nothing to undo or redo."""
        # Setup
        undo_redo = mock_main_window.undo_redo_manager
        undo_redo.action_history = []
        undo_redo.redo_history = []

        # Test undo with empty history
        undo_redo.undo()
        mock_main_window._show_notification.assert_called_once_with("Nothing to undo.")

        # Reset mock
        mock_main_window._show_notification.reset_mock()

        # Test redo with empty history
        undo_redo.redo()
        mock_main_window._show_notification.assert_called_once_with("Nothing to redo.")

    # --- Bug fix: undo beyond empty state (out-of-bounds segment) ---

    def test_undo_add_segment_out_of_bounds(self, mock_main_window):
        """Test that undoing add_segment with out-of-bounds index is handled gracefully.

        Regression test: undoing past the last segment used to corrupt state by
        leaving an invalid action in redo_history, which caused phantom classes.
        """
        undo_redo = mock_main_window.undo_redo_manager
        # Segment index 5 but no segments exist
        undo_redo.action_history = [{"type": "add_segment", "segment_index": 5}]
        undo_redo.redo_history = []
        mock_main_window.segment_manager.segments = []

        undo_redo.undo()

        # Redo history should be cleaned up (invalid action removed)
        assert len(undo_redo.redo_history) == 0
        assert len(undo_redo.action_history) == 0
        mock_main_window._show_warning_notification.assert_called_once_with(
            "Cannot undo: Segment no longer exists"
        )

    def test_undo_add_segment_none_index(self, mock_main_window):
        """Test that undoing add_segment with None segment_index is handled gracefully."""
        undo_redo = mock_main_window.undo_redo_manager
        undo_redo.action_history = [{"type": "add_segment"}]  # Missing segment_index
        undo_redo.redo_history = []
        mock_main_window.segment_manager.segments = []

        undo_redo.undo()

        assert len(undo_redo.redo_history) == 0
        assert len(undo_redo.action_history) == 0
        mock_main_window._show_warning_notification.assert_called_once_with(
            "Cannot undo: Missing segment index"
        )

    def test_undo_move_polygon_out_of_bounds(self, mock_main_window):
        """Test that undoing move_polygon with out-of-bounds segment is handled gracefully."""
        undo_redo = mock_main_window.undo_redo_manager
        undo_redo.action_history = [
            {
                "type": "move_polygon",
                "initial_vertices": {5: [[10, 10], [20, 20]]},
                "final_vertices": {5: [[15, 15], [25, 25]]},
            }
        ]
        undo_redo.redo_history = []
        mock_main_window.segment_manager.segments = []  # No segments

        undo_redo.undo()

        assert len(undo_redo.redo_history) == 0
        assert len(undo_redo.action_history) == 0
        mock_main_window._show_warning_notification.assert_called_once_with(
            "Cannot undo: Segment no longer exists"
        )

    def test_undo_move_polygon_missing_data(self, mock_main_window):
        """Test that undoing move_polygon with missing initial_vertices is handled."""
        undo_redo = mock_main_window.undo_redo_manager
        undo_redo.action_history = [
            {"type": "move_polygon"}  # Missing initial_vertices
        ]
        undo_redo.redo_history = []

        undo_redo.undo()

        assert len(undo_redo.redo_history) == 0
        assert len(undo_redo.action_history) == 0
        mock_main_window._show_warning_notification.assert_called_once_with(
            "Cannot undo: Missing polygon data"
        )

    def test_undo_does_not_corrupt_redo_on_failure(self, mock_main_window):
        """Test that a failed undo doesn't leave corrupted actions in redo history.

        Regression test: the undo() method pushes to redo_history before executing
        the handler. If the handler fails, the corrupted action must be removed
        from redo_history to prevent phantom state on subsequent redo calls.
        """
        undo_redo = mock_main_window.undo_redo_manager
        # Two valid actions followed by one that will fail
        undo_redo.action_history = [
            {"type": "add_segment", "segment_index": 0},
            {"type": "add_segment", "segment_index": 99},  # Will fail
        ]
        undo_redo.redo_history = []
        mock_main_window.segment_manager.segments = [
            {"type": "Polygon", "vertices": []}
        ]

        # Undo the invalid one (index 99, popped last)
        undo_redo.undo()

        # Invalid action cleaned from redo
        assert len(undo_redo.redo_history) == 0
        # Valid action still in history
        assert len(undo_redo.action_history) == 1
        assert undo_redo.action_history[0]["segment_index"] == 0

    # --- Bug fix: vertex dragging in sequence mode (mouse handler routing) ---

    def test_get_original_mouse_press_single_mode(self, mock_main_window):
        """Test that _get_original_mouse_press returns single-view handler in single mode."""
        mock_main_window.view_mode = "single"
        single_handler = MagicMock(name="single_press")
        mock_main_window._original_mouse_press = single_handler

        result = mock_main_window._get_original_mouse_press()
        assert result is single_handler

    def test_get_original_mouse_press_sequence_mode(self, mock_main_window):
        """Test that _get_original_mouse_press returns sequence handler in sequence mode.

        Regression test: vertex dragging was broken in sequence mode because
        the mouse handler always used the single-view original handler,
        which pointed to the wrong scene.
        """
        mock_main_window.view_mode = "sequence"
        single_handler = MagicMock(name="single_press")
        seq_handler = MagicMock(name="seq_press")
        mock_main_window._original_mouse_press = single_handler
        mock_main_window._seq_original_mouse_press = seq_handler

        result = mock_main_window._get_original_mouse_press()
        assert result is seq_handler
        assert result is not single_handler

    def test_get_original_mouse_move_sequence_mode(self, mock_main_window):
        """Test that _get_original_mouse_move returns sequence handler in sequence mode."""
        mock_main_window.view_mode = "sequence"
        single_handler = MagicMock(name="single_move")
        seq_handler = MagicMock(name="seq_move")
        mock_main_window._original_mouse_move = single_handler
        mock_main_window._seq_original_mouse_move = seq_handler

        result = mock_main_window._get_original_mouse_move()
        assert result is seq_handler

    def test_get_original_mouse_release_sequence_mode(self, mock_main_window):
        """Test that _get_original_mouse_release returns sequence handler in sequence mode."""
        mock_main_window.view_mode = "sequence"
        single_handler = MagicMock(name="single_release")
        seq_handler = MagicMock(name="seq_release")
        mock_main_window._original_mouse_release = single_handler
        mock_main_window._seq_original_mouse_release = seq_handler

        result = mock_main_window._get_original_mouse_release()
        assert result is seq_handler

    def test_get_original_mouse_press_sequence_mode_fallback(self, mock_main_window):
        """Test fallback to single handler when sequence handler doesn't exist."""
        mock_main_window.view_mode = "sequence"
        single_handler = MagicMock(name="single_press")
        mock_main_window._original_mouse_press = single_handler
        # Don't set _seq_original_mouse_press — simulates sequence viewer not yet set up

        result = mock_main_window._get_original_mouse_press()
        assert result is single_handler

    # --- Bug fix: undo history not cleared on sequence frame switch ---

    def test_sequence_frame_switch_clears_undo_history(self, mock_main_window):
        """Test that switching frames in sequence mode clears undo/redo history.

        Regression test: undo history was not frame-scoped in sequence mode.
        Actions from a previous frame could undo/redo into the current frame,
        re-adding old segments with different class_ids (phantom classes).
        """
        undo_redo = mock_main_window.undo_redo_manager
        # Simulate having actions from a previous frame
        undo_redo.action_history = [
            {"type": "add_segment", "segment_index": 0},
            {"type": "add_segment", "segment_index": 1},
        ]
        undo_redo.redo_history = [
            {"type": "add_segment", "segment_index": 2, "segment_data": {}},
        ]

        # Mock the dependencies that _load_sequence_frame_segments needs
        mock_main_window.segment_display_manager = MagicMock()
        mock_main_window.sequence_view_mode = None  # Skip propagation check
        mock_main_window.file_manager = MagicMock()
        mock_main_window._display_sequence_segments = MagicMock()

        # Call the method that loads a new frame
        mock_main_window._load_sequence_frame_segments("/fake/path/image.png")

        # Both histories must be empty after frame switch
        assert len(undo_redo.action_history) == 0
        assert len(undo_redo.redo_history) == 0

    def test_reset_state_clears_histories(self, mock_main_window):
        """Test that reset_state clears both action and redo histories."""
        # Setup
        undo_redo = mock_main_window.undo_redo_manager
        undo_redo.action_history = [{"type": "add_segment"}]
        undo_redo.redo_history = [{"type": "add_segment"}]
        mock_main_window.clear_all_points = MagicMock()
        mock_main_window.segment_manager.clear = MagicMock()
        mock_main_window.viewer = MagicMock()
        mock_main_window.viewer.scene().items.return_value = []
        mock_main_window.segment_items = MagicMock()
        mock_main_window.highlight_items = MagicMock()

        # Call reset_state
        mock_main_window._reset_state()

        # Verify histories are cleared
        assert len(undo_redo.action_history) == 0
        assert len(undo_redo.redo_history) == 0
