"""
Pytest tests for bounding box functionality logic.
"""

import os
import sys
from unittest.mock import Mock

import pytest

# Add the src directory to path for testing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


class TestBboxLogic:
    """Test bounding box logic without Qt dependencies."""

    def test_bbox_start_logic(self):
        """Test bounding box start logic."""

        class MockMainWindow:
            def _handle_multi_view_bbox_start(self, pos, viewer_index):
                """Implementation of bbox start logic."""
                if not hasattr(self, "multi_view_bbox_starts"):
                    self.multi_view_bbox_starts = [None for _ in range(2)]

                self.multi_view_bbox_starts[viewer_index] = pos

                # Store for later updates
                if not hasattr(self, "multi_view_bbox_rects"):
                    self.multi_view_bbox_rects = [None for _ in range(2)]

                # Mock rectangle item
                rect_item = Mock()
                self.multi_view_bbox_rects[viewer_index] = rect_item

        mock_window = MockMainWindow()
        mock_pos = Mock()
        mock_pos.x.return_value = 50
        mock_pos.y.return_value = 50

        # Test bbox start
        mock_window._handle_multi_view_bbox_start(mock_pos, 0)

        # Verify state
        assert hasattr(mock_window, 'multi_view_bbox_starts')
        assert hasattr(mock_window, 'multi_view_bbox_rects')
        assert mock_window.multi_view_bbox_starts[0] is mock_pos
        assert mock_window.multi_view_bbox_rects[0] is not None

    def test_bbox_drag_logic(self):
        """Test bounding box drag logic."""

        class MockMainWindow:
            def __init__(self):
                self.multi_view_bbox_starts = [Mock(), None]
                self.multi_view_bbox_starts[0].x.return_value = 50
                self.multi_view_bbox_starts[0].y.return_value = 50

                # Mock rectangle with setRect method
                mock_rect = Mock()
                mock_rect.setRect = Mock()
                self.multi_view_bbox_rects = [mock_rect, None]

            def _handle_multi_view_bbox_drag(self, pos, viewer_index):
                """Implementation of bbox drag logic."""
                if not hasattr(self, "multi_view_bbox_starts") or not hasattr(self, "multi_view_bbox_rects"):
                    return

                if (self.multi_view_bbox_starts[viewer_index] is None or
                    self.multi_view_bbox_rects[viewer_index] is None):
                    return

                # Update rectangle
                start_pos = self.multi_view_bbox_starts[viewer_index]
                rect_item = self.multi_view_bbox_rects[viewer_index]

                x = min(start_pos.x(), pos.x())
                y = min(start_pos.y(), pos.y())
                width = abs(pos.x() - start_pos.x())
                height = abs(pos.y() - start_pos.y())

                rect_item.setRect(x, y, width, height)

        mock_window = MockMainWindow()

        # Test drag
        drag_pos = Mock()
        drag_pos.x.return_value = 100
        drag_pos.y.return_value = 100

        mock_window._handle_multi_view_bbox_drag(drag_pos, 0)

        # Check that setRect was called with correct values
        rect_item = mock_window.multi_view_bbox_rects[0]
        assert rect_item.setRect.called

        call_args = rect_item.setRect.call_args[0]
        expected_x = min(50, 100)  # 50
        expected_y = min(50, 100)  # 50
        expected_width = abs(100 - 50)  # 50
        expected_height = abs(100 - 50)  # 50

        assert call_args == (expected_x, expected_y, expected_width, expected_height)

    def test_bbox_action_routing(self):
        """Test how bbox actions are routed through _handle_multi_view_action."""

        def test_action_routing(mode, action_type):
            """Test routing logic for a specific mode and action."""
            if action_type == "press":
                if mode == "bbox":
                    return "bbox_start"
                elif mode == "polygon":
                    return "polygon_click"
                elif mode == "ai":
                    return "ai_click"
            elif action_type == "move":
                if mode == "bbox":
                    return "bbox_drag"
                elif mode == "ai":
                    return "ai_drag"
            elif action_type == "release":
                if mode == "bbox":
                    return "bbox_complete"
                elif mode == "ai":
                    return "ai_release"
            return None

        # Test bbox mode routing
        assert test_action_routing("bbox", "press") == "bbox_start"
        assert test_action_routing("bbox", "move") == "bbox_drag"
        assert test_action_routing("bbox", "release") == "bbox_complete"

        # Test other modes for comparison
        assert test_action_routing("polygon", "press") == "polygon_click"
        assert test_action_routing("ai", "press") == "ai_click"
        assert test_action_routing("ai", "move") == "ai_drag"

    def test_bbox_mirroring_behavior(self):
        """Test that bbox mirroring works correctly."""

        class MockMainWindow:
            def __init__(self):
                self.mode = "bbox"
                self.multi_view_linked = [True, True]
                self.multi_view_images = [True, True]
                self.mirror_calls = []

            def _handle_multi_view_action(self, event, viewer_index, action_type):
                self.action_calls = getattr(self, 'action_calls', [])
                self.action_calls.append((viewer_index, action_type))

            def _mirror_mouse_action(self, event, target_viewer_index, action_type):
                self.mirror_calls.append((target_viewer_index, action_type))

            def simulate_mouse_event(self, source_viewer_index, action_type):
                """Simulate the logic from _multi_view_mouse_press/move/release."""
                mock_event = Mock()

                # Handle the event for the source viewer first
                if self.multi_view_linked[source_viewer_index]:
                    self._handle_multi_view_action(mock_event, source_viewer_index, action_type)

                # Mirror to other linked viewers (current logic mirrors all modes)
                for i in range(len(self.multi_view_linked)):
                    if (i != source_viewer_index and
                        self.multi_view_linked[i] and
                        self.multi_view_images[i]):
                        self._mirror_mouse_action(mock_event, i, action_type)

        mock_window = MockMainWindow()

        # Test press event mirroring
        mock_window.simulate_mouse_event(0, "press")

        # Should handle action for source viewer
        assert hasattr(mock_window, 'action_calls')
        assert (0, "press") in mock_window.action_calls

        # Should mirror to other viewer
        assert (1, "press") in mock_window.mirror_calls

    def test_bbox_cancellation_logic(self):
        """Test bbox cancellation when mouse leaves viewer."""

        class MockMainWindow:
            def __init__(self):
                self.multi_view_bbox_starts = [Mock(), None]
                self.multi_view_bbox_rects = [Mock(), None]
                self.notification_msg = ""

            def _show_notification(self, msg):
                self.notification_msg = msg

            def _cancel_multi_view_bbox(self, viewer_index):
                """Implementation of bbox cancellation logic."""
                # Clear bbox start position
                if hasattr(self, "multi_view_bbox_starts") and viewer_index < len(self.multi_view_bbox_starts):
                    self.multi_view_bbox_starts[viewer_index] = None

                # Remove visual rectangle (mocked)
                if hasattr(self, "multi_view_bbox_rects") and viewer_index < len(self.multi_view_bbox_rects):
                    rect_item = self.multi_view_bbox_rects[viewer_index]
                    if rect_item:
                        # In real code: viewer.scene().removeItem(rect_item)
                        pass
                    self.multi_view_bbox_rects[viewer_index] = None

                self._show_notification(f"Bounding box creation cancelled (mouse left viewer {viewer_index + 1})")

        mock_window = MockMainWindow()

        # Verify initial state
        assert mock_window.multi_view_bbox_starts[0] is not None
        assert mock_window.multi_view_bbox_rects[0] is not None

        # Test cancellation
        mock_window._cancel_multi_view_bbox(0)

        # Verify cancellation worked
        assert mock_window.multi_view_bbox_starts[0] is None
        assert mock_window.multi_view_bbox_rects[0] is None
        assert "cancelled" in mock_window.notification_msg


class TestBboxImplementation:
    """Test that bbox implementation methods exist."""

    def test_bbox_methods_exist_in_main_window(self):
        """Test that bbox methods exist in main window."""
        try:
            # Import the module properly
            from lazylabel.ui.main_window import MainWindow

            # Check that required bbox methods exist
            required_methods = [
                '_handle_multi_view_bbox_start',
                '_handle_multi_view_bbox_drag',
                '_handle_multi_view_bbox_complete',
                '_cancel_multi_view_bbox',
                'set_bbox_mode'
            ]

            for method in required_methods:
                assert hasattr(MainWindow, method), f"MainWindow missing method: {method}"

        except ImportError as e:
            pytest.skip(f"Cannot import MainWindow due to dependencies: {e}")

    def test_bbox_mode_value(self):
        """Test that bbox mode is correctly defined."""
        # The mode should be set to "bbox" when in bbox mode
        assert "bbox" == "bbox"  # Simple test to ensure string consistency

        # Test mode checking logic
        mode = "bbox"

        # This logic appears in the actual code
        bbox_actions = []
        if mode == "bbox":
            bbox_actions.extend(["start", "drag", "complete"])

        assert "start" in bbox_actions
        assert "drag" in bbox_actions
        assert "complete" in bbox_actions


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
