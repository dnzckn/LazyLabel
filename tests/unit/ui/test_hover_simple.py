#!/usr/bin/env python3
"""
Simple test for hover functionality core logic.
"""

import os
import sys
from unittest.mock import Mock

import pytest

# Add the src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))


def test_hover_setup_logic():
    """Test the core hover setup logic"""

    print("=== Testing Hover Setup Logic ===")

    # Test the hover item setup manually
    class MockHoverableItem:
        def __init__(self):
            self.segment_id = None
            self.main_window = None
            self.default_brush = None
            self.hover_brush = None

        def set_segment_info(self, segment_id, main_window):
            self.segment_id = segment_id
            self.main_window = main_window
            print(
                f"set_segment_info called: segment_id={segment_id}, main_window={main_window is not None}"
            )

        def simulate_hover_enter(self):
            """Simulate what happens in hoverEnterEvent"""
            print(f"Simulating hover enter for segment {self.segment_id}")

            # This is the logic from the actual hoverEnterEvent
            if (
                self.main_window
                and hasattr(self.main_window, "view_mode")
                and self.main_window.view_mode == "multi"
            ):
                print("View mode is multi, calling _trigger_segment_hover")
                self.main_window._trigger_segment_hover(self.segment_id, True, self)
                return True
            else:
                print(
                    f"Not calling _trigger_segment_hover - view_mode: {getattr(self.main_window, 'view_mode', 'None')}"
                )
                return False

    # Test single-view item
    single_item = MockHoverableItem()
    single_main_window = Mock()
    single_main_window.view_mode = "single"
    single_main_window._trigger_segment_hover = Mock()

    single_item.set_segment_info(1, single_main_window)
    single_result = single_item.simulate_hover_enter()

    print(f"Single-view hover trigger called: {single_result}")

    # Test multi-view item
    multi_item = MockHoverableItem()
    multi_main_window = Mock()
    multi_main_window.view_mode = "multi"
    multi_main_window._trigger_segment_hover = Mock()

    multi_item.set_segment_info(2, multi_main_window)
    multi_result = multi_item.simulate_hover_enter()

    print(f"Multi-view hover trigger called: {multi_result}")
    print(
        f"_trigger_segment_hover mock called: {multi_main_window._trigger_segment_hover.called}"
    )

    if multi_main_window._trigger_segment_hover.called:
        args = multi_main_window._trigger_segment_hover.call_args[0]
        print(f"Call args: segment_id={args[0]}, hover_state={args[1]}, item={args[2]}")

    # Assert the expected behavior
    assert not single_result, "Single-view should not trigger hover"
    assert multi_result, "Multi-view should trigger hover"


def test_trigger_segment_hover_logic():
    """Test the _trigger_segment_hover logic"""

    print("\n=== Testing _trigger_segment_hover Logic ===")

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

            # Set up the mock items with hover methods
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
            """Copy of the actual method logic"""
            print(
                f"_trigger_segment_hover called: segment_id={segment_id}, hover_state={hover_state}"
            )

            if self.view_mode != "multi":
                print("Not in multi-view mode, returning")
                return

            # Trigger hover state on corresponding segments in all viewers
            if hasattr(self, "multi_view_segment_items"):
                print("multi_view_segment_items exists")
                for (
                    viewer_idx,
                    viewer_segments,
                ) in self.multi_view_segment_items.items():
                    print(
                        f"Checking viewer {viewer_idx}, segments: {list(viewer_segments.keys())}"
                    )
                    if segment_id in viewer_segments:
                        print(
                            f"Found segment {segment_id} in viewer {viewer_idx} with {len(viewer_segments[segment_id])} items"
                        )
                        for item in viewer_segments[segment_id]:
                            # Skip the item that triggered the hover to avoid recursion
                            if item is triggering_item:
                                print("Skipping triggering item")
                                continue

                            if (
                                hasattr(item, "setBrush")
                                and hasattr(item, "hover_brush")
                                and hasattr(item, "default_brush")
                            ):
                                # For HoverablePolygonItem
                                print("Using setBrush for polygon item")
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
                                # For HoverablePixmapItem
                                print("Using setPixmap for pixmap item")
                                item.setPixmap(
                                    item.hover_pixmap
                                    if hover_state
                                    else item.default_pixmap
                                )
                    else:
                        print(f"Segment {segment_id} not found in viewer {viewer_idx}")
            else:
                print("multi_view_segment_items attribute not found")

    mock_window = MockMainWindow()

    print("Testing hover trigger for existing segment (5)...")
    mock_window._trigger_segment_hover(5, True, None)

    # Check if setBrush was called on items
    setBrush_calls = 0
    for viewer_items in mock_window.multi_view_segment_items.values():
        for segment_items in viewer_items.values():
            for item in segment_items:
                if item.setBrush.called:
                    setBrush_calls += 1

    print(f"setBrush called on {setBrush_calls} items")

    print("\nTesting hover trigger for non-existing segment (99)...")
    mock_window._trigger_segment_hover(99, True, None)

    # Assert that hover was triggered correctly
    assert setBrush_calls > 0, "setBrush should have been called on hover items"


def test_actual_hover_files():
    """Test that the actual hover files have the expected methods"""

    print("\n=== Testing Actual Hover Files ===")

    try:
        from lazylabel.ui.hoverable_pixelmap_item import HoverablePixmapItem
        from lazylabel.ui.hoverable_polygon_item import HoverablePolygonItem

        # Check if methods exist
        poly_methods = [
            "set_segment_info",
            "hoverEnterEvent",
            "hoverLeaveEvent",
            "set_brushes",
        ]

        pixmap_methods = [
            "set_segment_info",
            "hoverEnterEvent",
            "hoverLeaveEvent",
            "set_pixmaps",
        ]

        print("HoverablePolygonItem methods:")
        for method in poly_methods:
            exists = hasattr(HoverablePolygonItem, method)
            print(f"  {method}: {exists}")

        print("HoverablePixmapItem methods:")
        for method in pixmap_methods:
            exists = hasattr(HoverablePixmapItem, method)
            print(f"  {method}: {exists}")

        # Check if the hover event methods have the right logic
        import inspect

        poly_hover_source = inspect.getsource(HoverablePolygonItem.hoverEnterEvent)
        has_trigger_call = "_trigger_segment_hover" in poly_hover_source
        has_multi_check = 'view_mode == "multi"' in poly_hover_source

        print("\nHoverablePolygonItem.hoverEnterEvent analysis:")
        print(f"  Contains _trigger_segment_hover call: {has_trigger_call}")
        print(f"  Contains multi-view check: {has_multi_check}")

        pixmap_hover_source = inspect.getsource(HoverablePixmapItem.hoverEnterEvent)
        pixmap_has_trigger = "_trigger_segment_hover" in pixmap_hover_source
        pixmap_has_multi = 'view_mode == "multi"' in pixmap_hover_source

        print("\nHoverablePixmapItem.hoverEnterEvent analysis:")
        print(f"  Contains _trigger_segment_hover call: {pixmap_has_trigger}")
        print(f"  Contains multi-view check: {pixmap_has_multi}")

        # Assert that hover methods have the required logic
        assert has_trigger_call, "HoverablePolygonItem should have _trigger_segment_hover call"
        assert has_multi_check, "HoverablePolygonItem should have multi-view check"
        assert pixmap_has_trigger, "HoverablePixmapItem should have _trigger_segment_hover call"
        assert pixmap_has_multi, "HoverablePixmapItem should have multi-view check"

    except Exception as e:
        print(f"Error testing hover files: {e}")
        pytest.fail(f"Error testing hover files: {e}")


if __name__ == "__main__":
    print("Testing hover functionality core logic...")

    try:
        test1 = test_hover_setup_logic()
        test2 = test_trigger_segment_hover_logic()
        test3 = test_actual_hover_files()

        print("\n" + "=" * 60)
        if all([test1, test2, test3]):
            print("✓ ALL HOVER CORE LOGIC TESTS PASSED")
            print("\nThe hover logic should work. If it's still not working, check:")
            print("1. Are segments actually being created with set_segment_info?")
            print("2. Is the view_mode correctly set to 'multi'?")
            print("3. Are the hoverable items properly added to scenes?")
            print("4. Is the debug logging level set correctly?")
            print("\nRun debug_and_test_hover.py to see actual debug output.")
        else:
            print("✗ SOME HOVER CORE LOGIC TESTS FAILED")
            print("Check the output above for specific issues.")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ HOVER CORE LOGIC TEST FAILED: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
