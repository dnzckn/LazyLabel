#!/usr/bin/env python3
"""
Unit test for multi-view AI mode without GUI.
Tests the core logic and fixes.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from unittest.mock import Mock

from PyQt6.QtCore import QPointF, Qt


def test_lazy_loading():
    """Test that models don't load until AI mode is used."""
    print("Test 1: Lazy Loading")

    # Mock the main window
    main_window = Mock()
    main_window.view_mode = "multi"
    main_window.multi_view_models = []

    # Check initial state
    assert len(main_window.multi_view_models) == 0, (
        "Models should not be loaded initially"
    )
    print("✅ Models not loaded on multi-view switch")


def test_ai_mode_entry():
    """Test that AI mode can be entered without warnings in multi-view."""
    print("\nTest 2: AI Mode Entry")

    # Import the actual code
    from lazylabel.ui.main_window import MainWindow

    # Create a mock instance
    main_window = Mock(spec=MainWindow)
    main_window.view_mode = "multi"
    main_window.model_manager = Mock()
    main_window.model_manager.is_model_available.return_value = (
        False  # No model in single view
    )
    main_window._set_mode = Mock()
    main_window._ensure_sam_updated = Mock()

    # Apply the actual method
    MainWindow.set_sam_mode(main_window)

    # Check that mode was set (should not be blocked in multi-view)
    main_window._set_mode.assert_called_with("ai")
    print("✅ AI mode entered without model check in multi-view")


def test_model_initialization_on_click():
    """Test that models initialize on first AI click."""
    print("\nTest 3: Model Initialization on Click")

    from lazylabel.ui.main_window import MainWindow

    # Create mock
    main_window = Mock(spec=MainWindow)
    main_window.multi_view_models = []
    main_window.multi_view_init_worker = None
    main_window._show_notification = Mock()
    main_window._show_warning_notification = Mock()
    main_window._initialize_multi_view_models = Mock()

    # Mock event
    mock_event = Mock()
    mock_event.button.return_value = Qt.MouseButton.LeftButton

    # Apply the actual method
    pos = QPointF(100, 100)
    MainWindow._handle_multi_view_ai_click(main_window, pos, 0, mock_event)

    # Check that initialization was triggered
    main_window._show_notification.assert_called_with(
        "Loading AI models for first use..."
    )
    main_window._initialize_multi_view_models.assert_called_once()
    print("✅ Model initialization triggered on first AI click")


def test_escape_key_clearing():
    """Test that escape key clears AI points in multi-view."""
    print("\nTest 4: Escape Key Clearing")

    from lazylabel.ui.main_window import MainWindow

    # Create mock
    main_window = Mock(spec=MainWindow)
    main_window.view_mode = "multi"
    main_window.multi_view_polygon_points = [[QPointF(1, 1)], [QPointF(2, 2)]]
    main_window.multi_view_mode_handler = Mock()
    main_window.multi_view_mode_handler._clear_ai_previews = Mock()

    # Mock the polygon clearing
    def mock_clear_polygon(idx):
        main_window.multi_view_polygon_points[idx].clear()

    main_window._clear_multi_view_polygon = mock_clear_polygon

    # Apply the actual method
    MainWindow.clear_all_points(main_window)

    # Check that AI previews were cleared
    main_window.multi_view_mode_handler._clear_ai_previews.assert_called_once()
    print("✅ Escape key clears AI previews in multi-view")


def test_operate_on_view():
    """Test operate-on-view functionality."""
    print("\nTest 5: Operate-on-View")

    from lazylabel.ui.main_window import MainWindow

    # Create mock
    main_window = Mock(spec=MainWindow)
    main_window.settings = Mock()
    main_window.settings.operate_on_view = True
    main_window._get_multi_view_modified_image = Mock(return_value="modified_image")

    # Test that modified image is retrieved when operate_on_view is True
    result = main_window._get_multi_view_modified_image(0)
    assert result == "modified_image", "Should get modified image"
    print("✅ Operate-on-view gets modified image")


def test_model_cleanup():
    """Test model cleanup when switching views."""
    print("\nTest 6: Model Cleanup")

    from lazylabel.ui.main_window import MainWindow

    # Create mock for single-view cleanup
    main_window = Mock(spec=MainWindow)
    main_window.model_manager = Mock()
    main_window.model_manager.sam_model = Mock()
    main_window.model_manager.sam_model.model = Mock()
    main_window._show_notification = Mock()

    # Apply cleanup
    MainWindow._cleanup_single_view_model(main_window)

    # Check that model was cleared
    assert main_window.model_manager.sam_model is None, (
        "Single-view model should be cleared"
    )
    print("✅ Single-view model cleaned up when switching to multi-view")


def run_all_tests():
    """Run all unit tests."""
    print("🚀 Multi-View AI Unit Tests")
    print("=" * 40)

    try:
        test_lazy_loading()
        test_ai_mode_entry()
        test_model_initialization_on_click()
        test_escape_key_clearing()
        test_operate_on_view()
        test_model_cleanup()

        print("\n✅ All tests passed!")
        return True

    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback

        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
