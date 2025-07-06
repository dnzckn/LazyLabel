#!/usr/bin/env python3
"""
Integration test for mouse boundary detection in LazyLabel.
Tests the actual _cancel_multi_view_operations methods.
"""

import os
import sys
from unittest.mock import Mock

from PyQt6.QtCore import QPointF
from PyQt6.QtWidgets import QApplication

# Add the src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

def test_actual_cancellation_methods():
    """Test the actual cancellation methods from main_window.py"""

    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)

    # Import the main window class
    from lazylabel.ui.main_window import MainWindow
    from lazylabel.ui.photo_viewer import PhotoViewer

    # Create a mock main window with minimal setup
    main_window = MainWindow()

    # Set up multi-view mode attributes
    main_window.view_mode = "multi"
    main_window.mode = "bbox"
    main_window.multi_view_viewers = [PhotoViewer(), PhotoViewer()]

    # Mock the scene and items for testing
    mock_scene1 = Mock()
    mock_scene2 = Mock()
    main_window.multi_view_viewers[0].scene = Mock(return_value=mock_scene1)
    main_window.multi_view_viewers[1].scene = Mock(return_value=mock_scene2)

    # Set up bbox attributes
    main_window.multi_view_bbox_starts = [QPointF(10, 10), None]

    # Create mock rect items
    mock_rect1 = Mock()
    mock_rect1.scene.return_value = mock_scene1
    main_window.multi_view_bbox_rects = [mock_rect1, None]

    # Mock the notification method
    main_window._show_notification = Mock()

    print("=== Testing _cancel_multi_view_bbox ===")
    print(f"Before: bbox_starts = {main_window.multi_view_bbox_starts}")

    # Test bbox cancellation
    main_window._cancel_multi_view_bbox(0)

    print(f"After: bbox_starts = {main_window.multi_view_bbox_starts}")
    print(f"Notification called: {main_window._show_notification.called}")
    print(f"Scene removeItem called: {mock_scene1.removeItem.called}")

    # Verify the cancellation worked
    assert main_window.multi_view_bbox_starts[0] is None, "Bbox start should be cleared"
    assert main_window.multi_view_bbox_rects[0] is None, "Bbox rect should be cleared"
    assert main_window._show_notification.called, "Notification should be shown"
    assert mock_scene1.removeItem.called, "Scene item should be removed"

    print("✓ Bbox cancellation works correctly")

    # Test polygon cancellation
    print("\n=== Testing _cancel_multi_view_polygon ===")

    # Set up polygon attributes
    main_window.multi_view_polygon_points = [[], [QPointF(5, 5), QPointF(10, 10)]]
    main_window.multi_view_polygon_lines = [[], [Mock(), Mock()]]
    main_window.multi_view_polygon_point_items = [[], [Mock(), Mock()]]

    # Set up scene mocks for polygon items
    for item in main_window.multi_view_polygon_lines[1]:
        item.scene.return_value = mock_scene2
    for item in main_window.multi_view_polygon_point_items[1]:
        item.scene.return_value = mock_scene2

    print(f"Before: polygon_points = {len(main_window.multi_view_polygon_points[1])} points")
    print(f"Before: polygon_lines = {len(main_window.multi_view_polygon_lines[1])} lines")

    # Reset notification mock
    main_window._show_notification.reset_mock()

    # Test polygon cancellation
    main_window._cancel_multi_view_polygon(1)

    print(f"After: polygon_points = {len(main_window.multi_view_polygon_points[1])} points")
    print(f"After: polygon_lines = {len(main_window.multi_view_polygon_lines[1])} lines")
    print(f"Notification called: {main_window._show_notification.called}")

    # Verify polygon cancellation
    assert len(main_window.multi_view_polygon_points[1]) == 0, "Polygon points should be cleared"
    assert len(main_window.multi_view_polygon_lines[1]) == 0, "Polygon lines should be cleared"
    assert len(main_window.multi_view_polygon_point_items[1]) == 0, "Polygon point items should be cleared"
    assert main_window._show_notification.called, "Notification should be shown"

    print("✓ Polygon cancellation works correctly")

    print("\n=== Testing _cancel_multi_view_operations dispatcher ===")

    # Test the main dispatcher method
    main_window.mode = "bbox"
    main_window.multi_view_bbox_starts = [QPointF(20, 20), None]
    main_window._show_notification.reset_mock()

    # Call the main cancellation method
    main_window._cancel_multi_view_operations(0)

    assert main_window.multi_view_bbox_starts[0] is None, "Should cancel bbox operation"
    assert main_window._show_notification.called, "Should show notification"

    print("✓ Operation dispatcher works correctly")

def test_mouse_move_boundary_logic():
    """Test the mouse move boundary detection logic"""

    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)

    from lazylabel.ui.main_window import MainWindow
    from lazylabel.ui.photo_viewer import PhotoViewer

    # Create main window
    main_window = MainWindow()
    main_window.view_mode = "multi"
    main_window.mode = "bbox"

    # Set up viewers
    viewer1 = PhotoViewer()
    viewer1.resize(400, 300)
    viewer2 = PhotoViewer()
    viewer2.resize(400, 300)

    main_window.multi_view_viewers = [viewer1, viewer2]
    main_window.multi_view_linked = [True, True]

    # Mock the cancellation method
    main_window._cancel_multi_view_operations = Mock()
    main_window._handle_multi_view_action = Mock()

    # Create a mock mouse event
    mock_event = Mock()

    print("=== Testing Mouse Boundary Detection ===")

    # Test 1: Mouse inside viewport
    mock_event.scenePos.return_value = QPointF(100, 100)
    viewer1.mapFromScene = Mock(return_value=QPointF(50, 50))  # Inside viewport

    print("Test 1: Mouse inside viewport")
    main_window._multi_view_mouse_move(mock_event, 0)

    assert not main_window._cancel_multi_view_operations.called, "Should not cancel when inside"
    assert main_window._handle_multi_view_action.called, "Should handle action when inside"

    print("✓ Mouse inside viewport handled correctly")

    # Test 2: Mouse outside viewport
    main_window._cancel_multi_view_operations.reset_mock()
    main_window._handle_multi_view_action.reset_mock()

    mock_event.scenePos.return_value = QPointF(200, 200)
    viewer1.mapFromScene = Mock(return_value=QPointF(1000, 1000))  # Outside viewport

    print("Test 2: Mouse outside viewport")
    main_window._multi_view_mouse_move(mock_event, 0)

    assert main_window._cancel_multi_view_operations.called, "Should cancel when outside"
    assert not main_window._handle_multi_view_action.called, "Should not handle action when outside"

    print("✓ Mouse outside viewport handled correctly")

if __name__ == "__main__":
    print("Testing mouse boundary integration...")

    try:
        test_actual_cancellation_methods()
        test_mouse_move_boundary_logic()

        print("\n" + "="*60)
        print("✓ ALL INTEGRATION TESTS PASSED")
        print("The boundary cancellation feature is working correctly!")
        print("You can now test bbox/polygon cancellation in the actual app.")
        print("="*60)

    except Exception as e:
        print(f"\n✗ INTEGRATION TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
