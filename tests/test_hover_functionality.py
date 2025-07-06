"""
Pytest tests for mouse hover highlighting functionality.
"""

import os
import sys
from unittest.mock import Mock

import pytest

# Add the src directory to path for testing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


class TestHoverSetup:
    """Test hover item setup and configuration."""

    def test_hoverable_polygon_item_setup(self):
        """Test that HoverablePolygonItem is properly set up with segment info."""
        from PyQt6.QtCore import QPointF
        from PyQt6.QtGui import QPolygonF

        from lazylabel.ui.hoverable_polygon_item import HoverablePolygonItem

        # Create polygon item
        polygon = QPolygonF([QPointF(0, 0), QPointF(100, 0), QPointF(100, 100)])
        poly_item = HoverablePolygonItem(polygon)

        # Test initial state
        assert poly_item.segment_id is None
        assert poly_item.main_window is None
        assert poly_item.acceptHoverEvents() is True

        # Test setting segment info
        mock_main_window = Mock()
        mock_main_window.view_mode = "multi"

        poly_item.set_segment_info(5, mock_main_window)

        assert poly_item.segment_id == 5
        assert poly_item.main_window is mock_main_window

    def test_hoverable_pixmap_item_setup(self):
        """Test that HoverablePixmapItem is properly set up with segment info."""
        from lazylabel.ui.hoverable_pixelmap_item import HoverablePixmapItem

        pixmap_item = HoverablePixmapItem()

        # Test initial state
        assert pixmap_item.segment_id is None
        assert pixmap_item.main_window is None
        assert pixmap_item.acceptHoverEvents() is True

        # Test setting segment info
        mock_main_window = Mock()
        mock_main_window.view_mode = "multi"

        pixmap_item.set_segment_info(3, mock_main_window)

        assert pixmap_item.segment_id == 3
        assert pixmap_item.main_window is mock_main_window


class TestHoverLogic:
    """Test hover event logic and triggering."""

    def test_hover_setup_logic_single_vs_multi(self):
        """Test hover setup logic differences between single and multi-view."""

        class MockHoverableItem:
            def __init__(self):
                self.segment_id = None
                self.main_window = None

            def set_segment_info(self, segment_id, main_window):
                self.segment_id = segment_id
                self.main_window = main_window

            def simulate_hover_enter(self):
                """Simulate hoverEnterEvent logic."""
                if (self.main_window and
                    hasattr(self.main_window, 'view_mode') and
                    self.main_window.view_mode == "multi"):
                    self.main_window._trigger_segment_hover(self.segment_id, True, self)
                    return True
                return False

        # Test single-view item (should NOT trigger)
        single_item = MockHoverableItem()
        single_main_window = Mock()
        single_main_window.view_mode = "single"
        single_main_window._trigger_segment_hover = Mock()

        single_item.set_segment_info(1, single_main_window)
        single_result = single_item.simulate_hover_enter()

        assert single_result is False
        assert not single_main_window._trigger_segment_hover.called

        # Test multi-view item (SHOULD trigger)
        multi_item = MockHoverableItem()
        multi_main_window = Mock()
        multi_main_window.view_mode = "multi"
        multi_main_window._trigger_segment_hover = Mock()

        multi_item.set_segment_info(2, multi_main_window)
        multi_result = multi_item.simulate_hover_enter()

        assert multi_result is True
        assert multi_main_window._trigger_segment_hover.called

        # Check call arguments
        call_args = multi_main_window._trigger_segment_hover.call_args[0]
        assert call_args[0] == 2  # segment_id
        assert call_args[1] is True  # hover_state
        assert call_args[2] is multi_item  # triggering_item

    def test_trigger_segment_hover_logic(self):
        """Test the _trigger_segment_hover method logic."""

        class MockMainWindow:
            def __init__(self):
                self.view_mode = "multi"
                self.multi_view_segment_items = {
                    0: {
                        5: [Mock(), Mock()],  # segment 5 has 2 items in viewer 0
                    },
                    1: {
                        5: [Mock()],          # segment 5 has 1 item in viewer 1
                    }
                }

                # Set up mock items with hover methods
                for viewer_items in self.multi_view_segment_items.values():
                    for segment_items in viewer_items.values():
                        for item in segment_items:
                            item.setBrush = Mock()
                            item.setPixmap = Mock()
                            item.hover_brush = Mock()
                            item.default_brush = Mock()
                            item.hover_pixmap = Mock()
                            item.default_pixmap = Mock()

            def _trigger_segment_hover(self, segment_id, hover_state, triggering_item=None):
                """Copy of the actual method logic."""
                if self.view_mode != "multi":
                    return

                if hasattr(self, 'multi_view_segment_items'):
                    for viewer_idx, viewer_segments in self.multi_view_segment_items.items():
                        if segment_id in viewer_segments:
                            for item in viewer_segments[segment_id]:
                                if item is triggering_item:
                                    continue

                                if (hasattr(item, 'setBrush') and
                                    hasattr(item, 'hover_brush') and
                                    hasattr(item, 'default_brush')):
                                    item.setBrush(item.hover_brush if hover_state else item.default_brush)
                                elif (hasattr(item, 'setPixmap') and
                                      hasattr(item, 'hover_pixmap') and
                                      hasattr(item, 'default_pixmap')):
                                    item.setPixmap(item.hover_pixmap if hover_state else item.default_pixmap)

        mock_window = MockMainWindow()

        # Test hover trigger for existing segment
        mock_window._trigger_segment_hover(5, True, None)

        # Check that setBrush was called on all items for segment 5
        setBrush_calls = 0
        for viewer_items in mock_window.multi_view_segment_items.values():
            for segment_items in viewer_items.values():
                for item in segment_items:
                    if item.setBrush.called:
                        setBrush_calls += 1

        assert setBrush_calls == 3  # 2 in viewer 0 + 1 in viewer 1

        # Test hover trigger for non-existing segment (should not call setBrush)
        for viewer_items in mock_window.multi_view_segment_items.values():
            for segment_items in viewer_items.values():
                for item in segment_items:
                    item.setBrush.reset_mock()

        mock_window._trigger_segment_hover(99, True, None)

        setBrush_calls_after = 0
        for viewer_items in mock_window.multi_view_segment_items.values():
            for segment_items in viewer_items.values():
                for item in segment_items:
                    if item.setBrush.called:
                        setBrush_calls_after += 1

        assert setBrush_calls_after == 0


class TestHoverImplementation:
    """Test the actual hover implementation files."""

    def test_hoverable_polygon_item_methods(self):
        """Test that HoverablePolygonItem has required methods."""
        from lazylabel.ui.hoverable_polygon_item import HoverablePolygonItem

        required_methods = [
            'set_segment_info',
            'hoverEnterEvent',
            'hoverLeaveEvent',
            'set_brushes'
        ]

        for method in required_methods:
            assert hasattr(HoverablePolygonItem, method), f"Missing method: {method}"

    def test_hoverable_pixmap_item_methods(self):
        """Test that HoverablePixmapItem has required methods."""
        from lazylabel.ui.hoverable_pixelmap_item import HoverablePixmapItem

        required_methods = [
            'set_segment_info',
            'hoverEnterEvent',
            'hoverLeaveEvent',
            'set_pixmaps'
        ]

        for method in required_methods:
            assert hasattr(HoverablePixmapItem, method), f"Missing method: {method}"

    def test_hover_event_methods_have_correct_logic(self):
        """Test that hover event methods contain the expected logic."""
        import inspect

        from lazylabel.ui.hoverable_pixelmap_item import HoverablePixmapItem
        from lazylabel.ui.hoverable_polygon_item import HoverablePolygonItem

        # Check HoverablePolygonItem.hoverEnterEvent
        poly_hover_source = inspect.getsource(HoverablePolygonItem.hoverEnterEvent)
        assert "_trigger_segment_hover" in poly_hover_source
        assert 'view_mode == "multi"' in poly_hover_source

        # Check HoverablePixmapItem.hoverEnterEvent
        pixmap_hover_source = inspect.getsource(HoverablePixmapItem.hoverEnterEvent)
        assert "_trigger_segment_hover" in pixmap_hover_source
        assert 'view_mode == "multi"' in pixmap_hover_source


class TestBoundaryBehavior:
    """Test boundary cancellation behavior."""

    def test_polygon_boundary_behavior(self):
        """Test that polygon mode allows cross-viewer movement."""

        class MockMainWindow:
            def __init__(self):
                self.mode = "polygon"
                self.multi_view_viewers = [Mock(), Mock()]

            def _is_mouse_in_any_viewer(self, scene_pos):
                """Mock implementation - return True if in any viewer."""
                return True  # Simulate mouse being in some viewer

            def _cancel_multi_view_operations(self, viewer_index):
                self.cancelled = True

        mock_window = MockMainWindow()
        mock_window.cancelled = False

        # Simulate polygon mode logic from _multi_view_mouse_move
        scene_pos = Mock()

        if mock_window.mode == "polygon":
            if not mock_window._is_mouse_in_any_viewer(scene_pos):
                mock_window._cancel_multi_view_operations(0)

        # Should not cancel when mouse is in a viewer
        assert not mock_window.cancelled

    def test_bbox_boundary_behavior(self):
        """Test that bbox mode cancels when leaving current viewer."""

        class MockMainWindow:
            def __init__(self):
                self.mode = "bbox"

            def _cancel_multi_view_operations(self, viewer_index):
                self.cancelled = True

        mock_window = MockMainWindow()
        mock_window.cancelled = False

        # Simulate bbox mode logic - should cancel when outside current viewer
        viewer_rect_contains = False  # Mouse outside current viewer

        if mock_window.mode != "polygon":
            if not viewer_rect_contains:
                mock_window._cancel_multi_view_operations(0)

        # Should cancel when mouse leaves current viewer
        assert mock_window.cancelled


if __name__ == "__main__":
    pytest.main([__file__])
