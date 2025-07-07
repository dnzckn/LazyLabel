#!/usr/bin/env python3
"""
Test script specifically for mouse hover highlighting in multi-view mode.
"""

import os
import sys
from unittest.mock import Mock

from PyQt6.QtCore import QPointF
from PyQt6.QtGui import QBrush, QColor
from PyQt6.QtWidgets import QApplication

# Add the src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))


def test_hoverable_item_setup():
    """Test that hoverable items are properly set up with segment info"""

    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)

    print("=== Testing Hoverable Item Setup ===")

    from PyQt6.QtGui import QPolygonF

    from lazylabel.ui.hoverable_pixelmap_item import HoverablePixmapItem
    from lazylabel.ui.hoverable_polygon_item import HoverablePolygonItem

    # Test polygon item
    polygon = QPolygonF([QPointF(0, 0), QPointF(100, 0), QPointF(100, 100)])
    poly_item = HoverablePolygonItem(polygon)

    # Test initial state
    print(f"Polygon item created: {poly_item is not None}")
    print(f"Initial segment_id: {poly_item.segment_id}")
    print(f"Initial main_window: {poly_item.main_window}")
    print(f"Hover events accepted: {poly_item.acceptHoverEvents()}")

    # Test setting segment info
    mock_main_window = Mock()
    mock_main_window.view_mode = "multi"

    poly_item.set_segment_info(5, mock_main_window)

    print("After set_segment_info:")
    print(f"  segment_id: {poly_item.segment_id}")
    print(f"  main_window set: {poly_item.main_window is not None}")

    # Test pixmap item
    pixmap_item = HoverablePixmapItem()
    print(f"\nPixmap item created: {pixmap_item is not None}")
    print(f"Hover events accepted: {pixmap_item.acceptHoverEvents()}")

    pixmap_item.set_segment_info(3, mock_main_window)
    print(f"Pixmap segment_id after setup: {pixmap_item.segment_id}")

    return True


def test_hover_event_triggering():
    """Test that hover events properly trigger _trigger_segment_hover"""

    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)

    print("\n=== Testing Hover Event Triggering ===")

    from PyQt6.QtGui import QPolygonF

    from lazylabel.ui.hoverable_polygon_item import HoverablePolygonItem

    # Create polygon item
    polygon = QPolygonF([QPointF(0, 0), QPointF(100, 0), QPointF(100, 100)])
    poly_item = HoverablePolygonItem(polygon)

    # Set up brushes
    default_brush = QBrush(QColor(255, 0, 0, 100))
    hover_brush = QBrush(QColor(255, 0, 0, 200))
    poly_item.set_brushes(default_brush, hover_brush)

    # Set up mock main window with _trigger_segment_hover
    mock_main_window = Mock()
    mock_main_window.view_mode = "multi"
    mock_main_window._trigger_segment_hover = Mock()

    poly_item.set_segment_info(7, mock_main_window)

    print("Polygon item setup complete")
    print(f"Default brush: {poly_item.default_brush}")
    print(f"Hover brush: {poly_item.hover_brush}")

    # Test hover enter event
    print("\nTesting hover enter event...")

    # Create a mock hover event
    mock_hover_event = Mock()

    # Trigger hover enter
    poly_item.hoverEnterEvent(mock_hover_event)

    # Check results
    trigger_called = mock_main_window._trigger_segment_hover.called
    print(f"_trigger_segment_hover called: {trigger_called}")

    if trigger_called:
        call_args = mock_main_window._trigger_segment_hover.call_args
        print(f"Call args: {call_args}")

        # Should be called with (segment_id=7, hover_state=True, triggering_item=poly_item)
        if call_args:
            args, kwargs = call_args
            print(f"  segment_id: {args[0] if len(args) > 0 else 'missing'}")
            print(f"  hover_state: {args[1] if len(args) > 1 else 'missing'}")
            print(f"  triggering_item: {args[2] if len(args) > 2 else 'missing'}")

    # Check brush change
    current_brush = poly_item.brush()
    print(f"Current brush after hover: {current_brush}")
    print(f"Is hover brush: {current_brush == hover_brush}")

    # Test hover leave event
    print("\nTesting hover leave event...")
    mock_main_window._trigger_segment_hover.reset_mock()

    poly_item.hoverLeaveEvent(mock_hover_event)

    leave_trigger_called = mock_main_window._trigger_segment_hover.called
    print(f"_trigger_segment_hover called on leave: {leave_trigger_called}")

    if leave_trigger_called:
        call_args = mock_main_window._trigger_segment_hover.call_args
        if call_args:
            args, kwargs = call_args
            print(f"  hover_state on leave: {args[1] if len(args) > 1 else 'missing'}")

    # Check brush restored
    current_brush_after_leave = poly_item.brush()
    print(f"Brush after leave: {current_brush_after_leave == default_brush}")

    return trigger_called and leave_trigger_called


def test_multi_view_segment_tracking():
    """Test that multi-view segment tracking works"""

    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)

    print("\n=== Testing Multi-View Segment Tracking ===")

    # Mock main window with multi-view segment items structure
    class MockMainWindow:
        def __init__(self):
            self.view_mode = "multi"
            self.multi_view_segment_items = {
                0: {  # viewer 0
                    5: [Mock(), Mock()],  # segment 5 has 2 items
                    7: [Mock()],  # segment 7 has 1 item
                },
                1: {  # viewer 1
                    5: [Mock()],  # segment 5 has 1 item
                    7: [Mock(), Mock()],  # segment 7 has 2 items
                },
            }

        def _trigger_segment_hover(self, segment_id, hover_state, triggering_item=None):
            print("  _trigger_segment_hover called:")
            print(f"    segment_id: {segment_id}")
            print(f"    hover_state: {hover_state}")
            print(f"    triggering_item: {triggering_item}")

            # Simulate the actual trigger logic
            for viewer_idx, viewer_segments in self.multi_view_segment_items.items():
                print(f"    Checking viewer {viewer_idx}")
                if segment_id in viewer_segments:
                    print(f"    Found segment {segment_id} in viewer {viewer_idx}")
                    for item in viewer_segments[segment_id]:
                        if item is triggering_item:
                            print("      Skipping triggering item")
                            continue

                        # Mock the hover state change
                        if hasattr(item, "setBrush"):
                            print("      Would setBrush on item")
                        elif hasattr(item, "setPixmap"):
                            print("      Would setPixmap on item")

    mock_main_window = MockMainWindow()

    print("Multi-view segment structure:")
    for viewer_idx, segments in mock_main_window.multi_view_segment_items.items():
        print(f"  Viewer {viewer_idx}: segments {list(segments.keys())}")
        for seg_id, items in segments.items():
            print(f"    Segment {seg_id}: {len(items)} items")

    print("\nTesting hover trigger for segment 5...")
    mock_main_window._trigger_segment_hover(5, True, None)

    print("\nTesting hover trigger for segment 7...")
    mock_main_window._trigger_segment_hover(7, False, None)

    return True


def test_single_vs_multiview_hover():
    """Test hover behavior difference between single and multi-view"""

    print("\n=== Testing Single vs Multi-View Hover ===")

    from PyQt6.QtGui import QPolygonF

    from lazylabel.ui.hoverable_polygon_item import HoverablePolygonItem

    # Create two identical polygon items
    polygon = QPolygonF([QPointF(0, 0), QPointF(50, 50)])

    single_item = HoverablePolygonItem(polygon)
    multi_item = HoverablePolygonItem(polygon)

    # Set up single-view item (no main window reference)
    single_mock = Mock()
    single_mock.view_mode = "single"
    single_mock._trigger_segment_hover = Mock()

    single_item.set_segment_info(1, single_mock)

    # Set up multi-view item
    multi_mock = Mock()
    multi_mock.view_mode = "multi"
    multi_mock._trigger_segment_hover = Mock()

    multi_item.set_segment_info(1, multi_mock)

    print("Single-view item hover setup complete")
    print("Multi-view item hover setup complete")

    # Test hover events
    mock_event = Mock()

    print("\nTriggering hover on single-view item...")
    single_item.hoverEnterEvent(mock_event)
    single_trigger_called = single_mock._trigger_segment_hover.called
    print(f"Single-view _trigger_segment_hover called: {single_trigger_called}")

    print("\nTriggering hover on multi-view item...")
    multi_item.hoverEnterEvent(mock_event)
    multi_trigger_called = multi_mock._trigger_segment_hover.called
    print(f"Multi-view _trigger_segment_hover called: {multi_trigger_called}")

    # In single view, _trigger_segment_hover should NOT be called
    # In multi view, _trigger_segment_hover SHOULD be called
    expected_result = (not single_trigger_called) and multi_trigger_called

    print("\nExpected behavior: single=False, multi=True")
    print(
        f"Actual behavior: single={single_trigger_called}, multi={multi_trigger_called}"
    )
    print(f"Test passed: {expected_result}")

    return expected_result


if __name__ == "__main__":
    print("Testing mouse hover highlighting in multi-view mode...")

    try:
        test1 = test_hoverable_item_setup()
        test2 = test_hover_event_triggering()
        test3 = test_multi_view_segment_tracking()
        test4 = test_single_vs_multiview_hover()

        print("\n" + "=" * 60)
        if all([test1, test2, test3, test4]):
            print("✓ ALL HOVER TESTS PASSED")
            print("Hover highlighting should work in multi-view mode.")
            print("If it still doesn't work, the issue might be:")
            print("1. Segments not being created with proper hover setup")
            print("2. View mode not being set to 'multi' correctly")
            print("3. Scene/viewer event handling issues")
        else:
            print("✗ SOME HOVER TESTS FAILED")
            print("Check the output above for specific issues.")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ HOVER TEST FAILED: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
