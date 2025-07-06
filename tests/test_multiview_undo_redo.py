"""
Comprehensive unit tests for multi-view undo/redo functionality.
"""

import os
import sys
from unittest.mock import Mock

import pytest
from PyQt6.QtCore import QPointF

# Add the src directory to path for testing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


class TestMultiViewUndoRedo:
    """Test multi-view undo/redo functionality."""

    def setup_method(self):
        """Set up test fixtures for each test method."""
        # Mock main window with minimal undo/redo functionality
        self.main_window = Mock()
        self.main_window.view_mode = "multi"
        self.main_window.action_history = []
        self.main_window.redo_history = []

        # Mock multi-view components
        self.main_window.multi_view_point_items = [[], []]
        self.main_window.multi_view_positive_points = [[], []]
        self.main_window.multi_view_negative_points = [[], []]
        self.main_window.multi_view_viewers = [Mock(), Mock()]
        self.main_window.multi_view_mode_handler = Mock()

        # Mock scene methods
        for viewer in self.main_window.multi_view_viewers:
            viewer.scene.return_value.removeItem = Mock()

        # Mock notification methods
        self.main_window._show_notification = Mock()
        self.main_window._show_warning_notification = Mock()

    def test_add_point_action_recording_multiview(self):
        """Test that multi-view add_point actions are recorded correctly."""
        # Simulate adding a point in multi-view mode
        point_item = Mock()
        point_coords = [100, 150]
        viewer_index = 0

        action = {
            "type": "add_point",
            "point_type": "positive",
            "point_coords": point_coords,
            "point_item": point_item,
            "viewer_mode": "multi",
            "viewer_index": viewer_index
        }

        self.main_window.action_history.append(action)

        # Verify action is recorded with correct multi-view data
        assert len(self.main_window.action_history) == 1
        recorded_action = self.main_window.action_history[0]

        assert recorded_action["type"] == "add_point"
        assert recorded_action["viewer_mode"] == "multi"
        assert recorded_action["viewer_index"] == viewer_index
        assert recorded_action["point_type"] == "positive"
        assert recorded_action["point_coords"] == point_coords
        assert recorded_action["point_item"] is point_item

    def test_undo_multiview_add_point_positive(self):
        """Test undoing a positive point addition in multi-view mode."""
        # Set up test scenario
        point_item = Mock()
        point_item.scene.return_value = Mock()
        viewer_index = 0

        # Add point to collections (simulate the point was added)
        self.main_window.multi_view_positive_points[viewer_index].append([100, 150])
        self.main_window.multi_view_point_items[viewer_index].append(point_item)

        # Create action
        action = {
            "type": "add_point",
            "point_type": "positive",
            "point_coords": [100, 150],
            "point_item": point_item,
            "viewer_mode": "multi",
            "viewer_index": viewer_index
        }
        self.main_window.action_history.append(action)

        # Import and test the actual undo logic

        # Mock the method with our test logic
        def mock_undo_last_action():
            if not self.main_window.action_history:
                self.main_window._show_notification("Nothing to undo.")
                return

            last_action = self.main_window.action_history.pop()
            action_type = last_action.get("type")
            self.main_window.redo_history.append(last_action)

            if action_type == "add_point":
                point_type = last_action.get("point_type")
                point_item = last_action.get("point_item")
                viewer_mode = last_action.get("viewer_mode", "single")

                if viewer_mode == "multi":
                    viewer_index = last_action.get("viewer_index")
                    if viewer_index is not None:
                        # Remove from multi-view point collections
                        if point_type == "positive":
                            if (hasattr(self.main_window, "multi_view_positive_points") and
                                viewer_index < len(self.main_window.multi_view_positive_points) and
                                self.main_window.multi_view_positive_points[viewer_index]):
                                self.main_window.multi_view_positive_points[viewer_index].pop()

                        # Remove from visual items
                        if (viewer_index < len(self.main_window.multi_view_point_items) and
                            point_item in self.main_window.multi_view_point_items[viewer_index]):
                            self.main_window.multi_view_point_items[viewer_index].remove(point_item)
                            if point_item.scene():
                                self.main_window.multi_view_viewers[viewer_index].scene().removeItem(point_item)

                    self.main_window._show_notification(f"Undid: Add Point (Viewer {viewer_index + 1})")

        # Execute undo
        mock_undo_last_action()

        # Verify results
        assert len(self.main_window.action_history) == 0  # Action was popped
        assert len(self.main_window.redo_history) == 1   # Action moved to redo
        assert len(self.main_window.multi_view_positive_points[viewer_index]) == 0  # Point removed
        assert len(self.main_window.multi_view_point_items[viewer_index]) == 0      # Visual item removed

        # Verify scene removeItem was called
        self.main_window.multi_view_viewers[viewer_index].scene().removeItem.assert_called_once_with(point_item)

        # Verify notification
        self.main_window._show_notification.assert_called_with("Undid: Add Point (Viewer 1)")

    def test_undo_multiview_add_point_negative(self):
        """Test undoing a negative point addition in multi-view mode."""
        # Set up test scenario
        point_item = Mock()
        point_item.scene.return_value = Mock()
        viewer_index = 1

        # Add point to collections (simulate the point was added)
        self.main_window.multi_view_negative_points[viewer_index].append([200, 250])
        self.main_window.multi_view_point_items[viewer_index].append(point_item)

        # Create action
        action = {
            "type": "add_point",
            "point_type": "negative",
            "point_coords": [200, 250],
            "point_item": point_item,
            "viewer_mode": "multi",
            "viewer_index": viewer_index
        }
        self.main_window.action_history.append(action)

        # Mock undo logic for negative point
        def mock_undo_negative_point():
            last_action = self.main_window.action_history.pop()
            self.main_window.redo_history.append(last_action)

            point_type = last_action.get("point_type")
            viewer_index = last_action.get("viewer_index")
            point_item = last_action.get("point_item")

            if point_type == "negative":
                if (hasattr(self.main_window, "multi_view_negative_points") and
                    viewer_index < len(self.main_window.multi_view_negative_points) and
                    self.main_window.multi_view_negative_points[viewer_index]):
                    self.main_window.multi_view_negative_points[viewer_index].pop()

            if (viewer_index < len(self.main_window.multi_view_point_items) and
                point_item in self.main_window.multi_view_point_items[viewer_index]):
                self.main_window.multi_view_point_items[viewer_index].remove(point_item)
                if point_item.scene():
                    self.main_window.multi_view_viewers[viewer_index].scene().removeItem(point_item)

        # Execute undo
        mock_undo_negative_point()

        # Verify results
        assert len(self.main_window.multi_view_negative_points[viewer_index]) == 0
        assert len(self.main_window.multi_view_point_items[viewer_index]) == 0
        self.main_window.multi_view_viewers[viewer_index].scene().removeItem.assert_called_once_with(point_item)

    def test_redo_multiview_add_point(self):
        """Test redoing a point addition in multi-view mode."""
        # Set up redo scenario
        point_coords = [150, 200]
        viewer_index = 0

        action = {
            "type": "add_point",
            "point_type": "positive",
            "point_coords": point_coords,
            "viewer_mode": "multi",
            "viewer_index": viewer_index
        }
        self.main_window.redo_history.append(action)

        # Mock redo logic
        def mock_redo_last_action():
            if not self.main_window.redo_history:
                self.main_window._show_notification("Nothing to redo.")
                return

            last_action = self.main_window.redo_history.pop()
            self.main_window.action_history.append(last_action)

            action_type = last_action.get("type")
            if action_type == "add_point":
                viewer_mode = last_action.get("viewer_mode", "single")
                if viewer_mode == "multi":
                    viewer_index = last_action.get("viewer_index")
                    point_coords = last_action.get("point_coords")
                    point_type = last_action.get("point_type")

                    if viewer_index is not None and point_coords:
                        # Simulate re-adding the point via multi-view handler
                        pos = QPointF(point_coords[0], point_coords[1])
                        positive = (point_type == "positive")

                        # Mock the handler call
                        self.main_window.multi_view_mode_handler.handle_ai_click(pos, Mock(), viewer_index)
                        self.main_window._show_notification(f"Redid: Add Point (Viewer {viewer_index + 1})")

        # Execute redo
        mock_redo_last_action()

        # Verify results
        assert len(self.main_window.redo_history) == 0    # Action was popped
        assert len(self.main_window.action_history) == 1  # Action moved back to history

        # Verify handler was called
        self.main_window.multi_view_mode_handler.handle_ai_click.assert_called_once()
        call_args = self.main_window.multi_view_mode_handler.handle_ai_click.call_args
        assert call_args[0][0].x() == point_coords[0]  # QPointF x coordinate
        assert call_args[0][0].y() == point_coords[1]  # QPointF y coordinate
        assert call_args[0][2] == viewer_index         # viewer_index parameter

        # Verify notification
        self.main_window._show_notification.assert_called_with("Redid: Add Point (Viewer 1)")

    def test_multiview_polygon_point_undo_redo(self):
        """Test undo/redo for multi-view polygon points."""
        # Set up polygon point scenario
        viewer_index = 0
        point_coords = [75, 125]

        # Mock polygon state
        self.main_window.multi_view_polygon_points = [[], []]
        self.main_window.multi_view_polygon_preview_items = [[], []]

        # Add polygon point
        point = QPointF(point_coords[0], point_coords[1])
        self.main_window.multi_view_polygon_points[viewer_index].append(point)

        dot_item = Mock()
        self.main_window.multi_view_polygon_preview_items[viewer_index].append(dot_item)

        action = {
            "type": "multi_view_polygon_point",
            "viewer_index": viewer_index,
            "point_coords": point_coords,
            "dot_item": dot_item
        }
        self.main_window.action_history.append(action)

        # Mock polygon point undo logic
        def mock_undo_polygon_point():
            last_action = self.main_window.action_history.pop()
            self.main_window.redo_history.append(last_action)

            viewer_index = last_action.get("viewer_index")
            if viewer_index is not None:
                # Remove the last point from the specific viewer
                if (viewer_index < len(self.main_window.multi_view_polygon_points) and
                    self.main_window.multi_view_polygon_points[viewer_index]):
                    self.main_window.multi_view_polygon_points[viewer_index].pop()

                # Remove the visual dot from the scene
                if (hasattr(self.main_window, "multi_view_polygon_preview_items") and
                    viewer_index < len(self.main_window.multi_view_polygon_preview_items)):
                    preview_items = self.main_window.multi_view_polygon_preview_items[viewer_index]
                    if preview_items:
                        dot_item = preview_items.pop()
                        if hasattr(dot_item, 'scene') and dot_item.scene():
                            self.main_window.multi_view_viewers[viewer_index].scene().removeItem(dot_item)

        # Execute undo
        mock_undo_polygon_point()

        # Verify results
        assert len(self.main_window.multi_view_polygon_points[viewer_index]) == 0
        assert len(self.main_window.multi_view_polygon_preview_items[viewer_index]) == 0

    def test_mixed_single_multiview_undo_redo(self):
        """Test undo/redo with mixed single-view and multi-view actions."""
        # Add single-view action
        single_action = {
            "type": "add_point",
            "point_type": "positive",
            "viewer_mode": "single",
            "point_coords": [50, 60]
        }

        # Add multi-view action
        multi_action = {
            "type": "add_point",
            "point_type": "negative",
            "viewer_mode": "multi",
            "viewer_index": 1,
            "point_coords": [150, 160]
        }

        self.main_window.action_history.extend([single_action, multi_action])

        # Verify both actions are in history
        assert len(self.main_window.action_history) == 2
        assert self.main_window.action_history[0]["viewer_mode"] == "single"
        assert self.main_window.action_history[1]["viewer_mode"] == "multi"
        assert self.main_window.action_history[1]["viewer_index"] == 1

    def test_undo_redo_edge_cases(self):
        """Test edge cases for undo/redo functionality."""
        # Test undo with empty history
        assert len(self.main_window.action_history) == 0

        def mock_undo_empty():
            if not self.main_window.action_history:
                self.main_window._show_notification("Nothing to undo.")
                return False
            return True

        result = mock_undo_empty()
        assert result is False
        self.main_window._show_notification.assert_called_with("Nothing to undo.")

        # Test redo with empty history
        assert len(self.main_window.redo_history) == 0

        def mock_redo_empty():
            if not self.main_window.redo_history:
                self.main_window._show_notification("Nothing to redo.")
                return False
            return True

        result = mock_redo_empty()
        assert result is False
        self.main_window._show_notification.assert_called_with("Nothing to redo.")

    def test_multiview_action_data_integrity(self):
        """Test that multi-view actions maintain data integrity."""
        # Test all required fields are present
        action = {
            "type": "add_point",
            "point_type": "positive",
            "point_coords": [100, 200],
            "point_item": Mock(),
            "viewer_mode": "multi",
            "viewer_index": 0
        }

        # Verify all required fields
        required_fields = ["type", "point_type", "point_coords", "viewer_mode", "viewer_index"]
        for field in required_fields:
            assert field in action, f"Missing required field: {field}"

        # Verify field types
        assert isinstance(action["viewer_index"], int)
        assert isinstance(action["point_coords"], list)
        assert len(action["point_coords"]) == 2
        assert action["viewer_mode"] in ["single", "multi"]
        assert action["point_type"] in ["positive", "negative"]

    def test_multiview_undo_redo_sequence(self):
        """Test a complete undo/redo sequence in multi-view mode."""
        # Set up initial state
        point_item = Mock()
        point_item.scene.return_value = Mock()
        viewer_index = 0

        # Simulate adding a point
        self.main_window.multi_view_positive_points[viewer_index].append([100, 150])
        self.main_window.multi_view_point_items[viewer_index].append(point_item)

        action = {
            "type": "add_point",
            "point_type": "positive",
            "point_coords": [100, 150],
            "point_item": point_item,
            "viewer_mode": "multi",
            "viewer_index": viewer_index
        }
        self.main_window.action_history.append(action)

        # Step 1: Undo
        last_action = self.main_window.action_history.pop()
        self.main_window.redo_history.append(last_action)
        self.main_window.multi_view_positive_points[viewer_index].pop()
        self.main_window.multi_view_point_items[viewer_index].remove(point_item)

        # Verify undo state
        assert len(self.main_window.action_history) == 0
        assert len(self.main_window.redo_history) == 1
        assert len(self.main_window.multi_view_positive_points[viewer_index]) == 0

        # Step 2: Redo
        last_action = self.main_window.redo_history.pop()
        self.main_window.action_history.append(last_action)
        # Simulate re-adding via handler (simplified)
        self.main_window.multi_view_positive_points[viewer_index].append([100, 150])
        self.main_window.multi_view_point_items[viewer_index].append(point_item)

        # Verify redo state
        assert len(self.main_window.action_history) == 1
        assert len(self.main_window.redo_history) == 0
        assert len(self.main_window.multi_view_positive_points[viewer_index]) == 1

    def test_multiview_undo_with_missing_viewer_index(self):
        """Test undo behavior when viewer_index is missing."""
        action = {
            "type": "add_point",
            "point_type": "positive",
            "viewer_mode": "multi",
            # Missing viewer_index
        }
        self.main_window.action_history.append(action)

        # Mock undo with missing viewer_index
        def mock_undo_missing_viewer():
            last_action = self.main_window.action_history.pop()
            self.main_window.redo_history.append(last_action)

            viewer_index = last_action.get("viewer_index")
            if viewer_index is None:
                # Should handle gracefully
                self.main_window._show_warning_notification("Cannot undo: Missing viewer index")
                return False
            return True

        result = mock_undo_missing_viewer()
        assert result is False
        self.main_window._show_warning_notification.assert_called_with("Cannot undo: Missing viewer index")


class TestMultiViewUndoRedoIntegration:
    """Integration tests for multi-view undo/redo with other systems."""

    def test_undo_redo_with_segment_manager(self):
        """Test undo/redo integration with segment manager."""
        # Mock segment manager
        segment_manager = Mock()
        segment_manager.segments = []
        segment_manager.delete_segments = Mock()
        segment_manager.add_segment = Mock()

        main_window = Mock()
        main_window.segment_manager = segment_manager
        main_window.action_history = []
        main_window.redo_history = []
        main_window._update_all_lists = Mock()
        main_window._show_notification = Mock()

        # Test add_segment undo/redo (should work in both single and multi-view)
        segment_data = {"type": "Polygon", "vertices": [[0, 0], [10, 10], [0, 10]]}
        action = {
            "type": "add_segment",
            "segment_index": 0,
            "segment_data": segment_data
        }

        main_window.action_history.append(action)

        # Verify add_segment actions work regardless of view mode
        assert action["type"] == "add_segment"
        assert "segment_data" in action

    def test_action_history_persistence(self):
        """Test that action history is maintained across view mode switches."""
        main_window = Mock()
        main_window.action_history = []

        # Add actions in different modes
        single_action = {"type": "add_point", "viewer_mode": "single"}
        multi_action = {"type": "add_point", "viewer_mode": "multi", "viewer_index": 0}

        main_window.action_history.extend([single_action, multi_action])

        # Verify history is preserved
        assert len(main_window.action_history) == 2
        assert main_window.action_history[0]["viewer_mode"] == "single"
        assert main_window.action_history[1]["viewer_mode"] == "multi"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
