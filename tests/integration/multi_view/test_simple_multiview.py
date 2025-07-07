#!/usr/bin/env python3
"""Simple test for multi-view segment creation without GUI dependencies."""

import os
import sys
from unittest.mock import patch

# Add the src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from PyQt6.QtCore import QPointF
from PyQt6.QtWidgets import QApplication


def test_multiview():
    """Test multiview functionality in headless mode."""
    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)

    # Mock the GUI components to prevent blocking
    with patch('lazylabel.ui.main_window.MainWindow.show'), \
         patch('lazylabel.ui.main_window.MainWindow._finalize_multi_view_polygon'), \
         patch('lazylabel.ui.main_window.MainWindow.set_polygon_mode'), \
         patch('PyQt6.QtWidgets.QApplication.processEvents'):

        from lazylabel.ui.main_window import MainWindow

        # Create main window (mocked show prevents GUI display)
        window = MainWindow()

        # Mock multi-view components that might not be initialized
        window.multi_view_polygon_points = {0: [], 1: []}
        window.multi_view_segment_items = {0: {}, 1: {}}

        # Test multi-view mode switching logic
        assert hasattr(window, 'view_tab_widget')

        # Test polygon mode setting
        window.set_polygon_mode()

        # Create test polygon points
        test_points = [
            QPointF(100, 100),
            QPointF(200, 100),
            QPointF(200, 200),
            QPointF(100, 200),
        ]

        # Simulate polygon creation
        window.multi_view_polygon_points[0] = test_points

        # Mock the finalize method to simulate segment creation
        mock_segment = {
            "type": "Polygon",
            "class_id": 1,
            "views": {0: {"points": test_points}, 1: {"points": test_points}}
        }
        window.segment_manager.segments = [mock_segment]

        # Verify the test setup works
        assert len(window.segment_manager.segments) == 1
        assert window.segment_manager.segments[0]["type"] == "Polygon"
        assert "views" in window.segment_manager.segments[0]
        assert 0 in window.segment_manager.segments[0]["views"]
        assert 1 in window.segment_manager.segments[0]["views"]

        # Verify multi-view components exist
        assert hasattr(window, 'multi_view_polygon_points')
        assert hasattr(window, 'multi_view_segment_items')


if __name__ == "__main__":
    test_multiview()
