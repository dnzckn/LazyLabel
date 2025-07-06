#!/usr/bin/env python3
"""Debug test for multi-view hover functionality."""

import logging
import os
import sys

from PyQt6.QtWidgets import QApplication

# Add the src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from lazylabel.ui.main_window import MainWindow  # noqa: E402

# Set up debug logging
logging.basicConfig(
    level=logging.DEBUG, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)


def test_hover():
    """Test hover functionality in multi-view mode."""
    app = QApplication(sys.argv)

    # Create main window
    window = MainWindow()
    window.show()

    # Load test images
    test_dir = "/home/deniz/python_projects/GitHub/LazyLabel/test_images"
    if os.path.exists(test_dir):
        window.open_folder(test_dir)

    # Switch to multi-view mode
    print("Switching to multi-view mode...")
    window.view_tab_widget.setCurrentIndex(1)

    print("\n" + "=" * 60)
    print("HOVER TEST INSTRUCTIONS:")
    print("=" * 60)
    print("1. Create some segments (polygon or AI)")
    print("2. Hover over segments and watch console for debug messages")
    print("3. Expected messages:")
    print("   - HoverablePolygonItem.hoverEnterEvent")
    print("   - _trigger_segment_hover called")
    print("   - Segment hover state changes")
    print("=" * 60)
    print("\nWindow is ready for testing...")

    app.exec()


if __name__ == "__main__":
    test_hover()
