"""
Pytest tests for hover logic without Qt dependencies.
"""

import os
import sys
from unittest.mock import Mock

import pytest

# Add the src directory to path for testing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


class TestHoverLogic:
    """Test hover event logic without Qt instantiation."""

    def test_hover_logic_single_vs_multi(self):
        """Test hover logic differences between single and multi-view."""

        class MockHoverableItem:
            def __init__(self):
                self.segment_id = None
                self.main_window = None

            def set_segment_info(self, segment_id, main_window):
                self.segment_id = segment_id
                self.main_window = main_window

            def simulate_hover_enter(self):
                """Simulate the logic from hoverEnterEvent."""
                if (
                    self.main_window
                    and hasattr(self.main_window, "view_mode")
                    and self.main_window.view_mode == "multi"
                ):
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
                        5: [Mock()],  # segment 5 has 1 item in viewer 1
                    },
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

            def _trigger_segment_hover(
                self, segment_id, hover_state, triggering_item=None
            ):
                """Implementation of the actual method logic."""
                if self.view_mode != "multi":
                    return

                if hasattr(self, "multi_view_segment_items"):
                    for (
                        _viewer_idx,
                        viewer_segments,
                    ) in self.multi_view_segment_items.items():
                        if segment_id in viewer_segments:
                            for item in viewer_segments[segment_id]:
                                if item is triggering_item:
                                    continue

                                if (
                                    hasattr(item, "setBrush")
                                    and hasattr(item, "hover_brush")
                                    and hasattr(item, "default_brush")
                                ):
                                    item.setBrush(
                                        item.hover_brush
                                        if hover_state
                                        else item.default_brush
                                    )
                                elif (
                                    hasattr(item, "setPixmap")
                                    and hasattr(item, "hover_pixmap")
                                    and hasattr(item, "default_pixmap")
                                ):
                                    item.setPixmap(
                                        item.hover_pixmap
                                        if hover_state
                                        else item.default_pixmap
                                    )

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

    def test_trigger_segment_hover_with_triggering_item_exclusion(self):
        """Test that triggering item is excluded from hover updates."""

        class MockMainWindow:
            def __init__(self):
                self.view_mode = "multi"
                self.triggering_item = Mock()
                self.other_item = Mock()

                # Set up items
                for item in [self.triggering_item, self.other_item]:
                    item.setBrush = Mock()
                    item.hover_brush = Mock()
                    item.default_brush = Mock()

                self.multi_view_segment_items = {
                    0: {7: [self.triggering_item, self.other_item]}
                }

            def _trigger_segment_hover(
                self, segment_id, hover_state, triggering_item=None
            ):
                """Implementation with triggering item exclusion."""
                if self.view_mode != "multi":
                    return

                if hasattr(self, "multi_view_segment_items"):
                    for (
                        _viewer_idx,
                        viewer_segments,
                    ) in self.multi_view_segment_items.items():
                        if segment_id in viewer_segments:
                            for item in viewer_segments[segment_id]:
                                if item is triggering_item:
                                    continue  # Skip the triggering item

                                if (
                                    hasattr(item, "setBrush")
                                    and hasattr(item, "hover_brush")
                                    and hasattr(item, "default_brush")
                                ):
                                    item.setBrush(
                                        item.hover_brush
                                        if hover_state
                                        else item.default_brush
                                    )

        mock_window = MockMainWindow()

        # Test with triggering item specified
        mock_window._trigger_segment_hover(7, True, mock_window.triggering_item)

        # Triggering item should NOT have setBrush called
        assert not mock_window.triggering_item.setBrush.called

        # Other item SHOULD have setBrush called
        assert mock_window.other_item.setBrush.called


class TestBoundaryLogic:
    """Test boundary cancellation logic."""

    def test_polygon_boundary_allows_cross_viewer(self):
        """Test that polygon mode allows cross-viewer movement."""

        class MockMainWindow:
            def __init__(self):
                self.mode = "polygon"
                self.cancelled = False

            def _is_mouse_in_any_viewer(self, scene_pos):
                return True  # Mouse is in some viewer

            def _cancel_multi_view_operations(self, viewer_index):
                self.cancelled = True

            def check_boundary_logic(self, scene_pos):
                """Simulate the boundary check logic from _multi_view_mouse_move."""
                if self.mode == "polygon":
                    if not self._is_mouse_in_any_viewer(scene_pos):
                        self._cancel_multi_view_operations(0)
                else:
                    # For other modes, would check current viewer bounds
                    pass

        mock_window = MockMainWindow()
        scene_pos = Mock()

        # Test polygon mode - should not cancel when mouse is in any viewer
        mock_window.check_boundary_logic(scene_pos)
        assert not mock_window.cancelled

    def test_bbox_boundary_cancels_on_viewer_exit(self):
        """Test that bbox mode cancels when leaving current viewer."""

        class MockMainWindow:
            def __init__(self):
                self.mode = "bbox"
                self.cancelled = False

            def _cancel_multi_view_operations(self, viewer_index):
                self.cancelled = True

            def check_boundary_logic(self, in_current_viewer):
                """Simulate bbox boundary check logic."""
                if self.mode == "polygon":
                    # Polygon mode has different logic
                    pass
                else:
                    # For bbox/other modes, cancel if not in current viewer
                    if not in_current_viewer:
                        self._cancel_multi_view_operations(0)

        mock_window = MockMainWindow()

        # Test bbox mode - should cancel when mouse leaves current viewer
        mock_window.check_boundary_logic(in_current_viewer=False)
        assert mock_window.cancelled

    def test_mouse_in_any_viewer_logic(self):
        """Test the _is_mouse_in_any_viewer logic."""

        class MockViewer:
            def __init__(self, contains_point):
                self.contains_point = contains_point

            def mapFromScene(self, scene_pos):
                return Mock(toPoint=Mock(return_value=Mock()))

            def viewport(self):
                mock_viewport = Mock()
                mock_viewport.rect.return_value.contains.return_value = (
                    self.contains_point
                )
                return mock_viewport

        class MockMainWindow:
            def __init__(self, viewer_contains):
                self.multi_view_viewers = [
                    MockViewer(viewer_contains[0]),
                    MockViewer(viewer_contains[1]),
                ]

            def _is_mouse_in_any_viewer(self, scene_pos):
                """Implementation of the actual method."""
                for viewer in self.multi_view_viewers:
                    view_pos = viewer.mapFromScene(scene_pos)
                    view_point = (
                        view_pos.toPoint() if hasattr(view_pos, "toPoint") else view_pos
                    )
                    viewer_rect = viewer.viewport().rect()
                    if viewer_rect.contains(view_point):
                        return True
                return False

        scene_pos = Mock()

        # Test: mouse in first viewer
        mock_window_1 = MockMainWindow([True, False])
        assert mock_window_1._is_mouse_in_any_viewer(scene_pos) is True

        # Test: mouse in second viewer
        mock_window_2 = MockMainWindow([False, True])
        assert mock_window_2._is_mouse_in_any_viewer(scene_pos) is True

        # Test: mouse in both viewers
        mock_window_both = MockMainWindow([True, True])
        assert mock_window_both._is_mouse_in_any_viewer(scene_pos) is True

        # Test: mouse in neither viewer
        mock_window_neither = MockMainWindow([False, False])
        assert mock_window_neither._is_mouse_in_any_viewer(scene_pos) is False


class TestHoverImplementationChecks:
    """Test that hover implementation files have correct structure."""

    def test_hoverable_files_exist(self):
        """Test that hoverable item files exist and are importable."""
        try:
            from lazylabel.ui.hoverable_pixelmap_item import (
                HoverablePixmapItem,  # noqa: F401
            )
            from lazylabel.ui.hoverable_polygon_item import (
                HoverablePolygonItem,  # noqa: F401
            )

            assert True  # If we get here, imports worked
        except ImportError as e:
            pytest.fail(f"Failed to import hoverable items: {e}")

    def test_hover_methods_exist(self):
        """Test that hover methods exist in implementation."""
        from lazylabel.ui.hoverable_pixelmap_item import HoverablePixmapItem
        from lazylabel.ui.hoverable_polygon_item import HoverablePolygonItem

        # Test HoverablePolygonItem methods
        poly_methods = [
            "set_segment_info",
            "hoverEnterEvent",
            "hoverLeaveEvent",
            "set_brushes",
        ]
        for method in poly_methods:
            assert hasattr(HoverablePolygonItem, method), (
                f"HoverablePolygonItem missing {method}"
            )

        # Test HoverablePixmapItem methods
        pixmap_methods = [
            "set_segment_info",
            "hoverEnterEvent",
            "hoverLeaveEvent",
            "set_pixmaps",
        ]
        for method in pixmap_methods:
            assert hasattr(HoverablePixmapItem, method), (
                f"HoverablePixmapItem missing {method}"
            )

    def test_hover_event_contains_trigger_logic(self):
        """Test that hover events contain _trigger_segment_hover calls."""
        import inspect

        from lazylabel.ui.hoverable_pixelmap_item import HoverablePixmapItem
        from lazylabel.ui.hoverable_polygon_item import HoverablePolygonItem

        # Check HoverablePolygonItem.hoverEnterEvent
        poly_source = inspect.getsource(HoverablePolygonItem.hoverEnterEvent)
        assert "_trigger_segment_hover" in poly_source, (
            "HoverablePolygonItem missing _trigger_segment_hover call"
        )
        assert 'view_mode == "multi"' in poly_source, (
            "HoverablePolygonItem missing multi-view check"
        )

        # Check HoverablePixmapItem.hoverEnterEvent
        pixmap_source = inspect.getsource(HoverablePixmapItem.hoverEnterEvent)
        assert "_trigger_segment_hover" in pixmap_source, (
            "HoverablePixmapItem missing _trigger_segment_hover call"
        )
        assert 'view_mode == "multi"' in pixmap_source, (
            "HoverablePixmapItem missing multi-view check"
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
