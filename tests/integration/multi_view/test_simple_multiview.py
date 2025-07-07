#!/usr/bin/env python3
"""Simple test for multi-view segment creation and hover."""

import os
import sys

# Add the src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from PyQt6.QtCore import QPointF
from PyQt6.QtWidgets import QApplication

from lazylabel.ui.main_window import MainWindow


def test_multiview():
    app = QApplication(sys.argv)

    # Create main window
    window = MainWindow()

    # Load test images
    test_dir = "/home/deniz/python_projects/GitHub/LazyLabel/test_images"
    if os.path.exists(test_dir):
        window.open_folder(test_dir)

    window.show()
    QApplication.processEvents()

    # Switch to multi-view mode
    print("Switching to multi-view mode...")
    window.view_tab_widget.setCurrentIndex(1)
    QApplication.processEvents()

    # Set polygon mode
    print("Setting polygon mode...")
    window.set_polygon_mode()
    QApplication.processEvents()

    # Create a test polygon in viewer 0
    print("Creating test polygon...")
    test_points = [
        QPointF(100, 100),
        QPointF(200, 100),
        QPointF(200, 200),
        QPointF(100, 200),
    ]

    # Simulate polygon creation
    window.multi_view_polygon_points[0] = test_points
    window._finalize_multi_view_polygon(0)
    QApplication.processEvents()

    # Check if segments were created
    print(f"\nSegments created: {len(window.segment_manager.segments)}")
    for i, seg in enumerate(window.segment_manager.segments):
        print(f"Segment {i}: type={seg.get('type')}, has_views={'views' in seg}")
        if "views" in seg:
            print(f"  Views: {list(seg['views'].keys())}")

    # Check if segment items were created
    print(f"\nMulti-view segment items: {window.multi_view_segment_items}")
    for viewer_idx, segments in window.multi_view_segment_items.items():
        print(f"Viewer {viewer_idx}: {len(segments)} segments")
        for seg_idx, items in segments.items():
            print(f"  Segment {seg_idx}: {len(items)} items")
            for item in items:
                print(f"    Item: {type(item).__name__}")
                if hasattr(item, "segment_id"):
                    print(f"      segment_id: {item.segment_id}")
                if hasattr(item, "main_window"):
                    print(f"      main_window set: {item.main_window is not None}")

    print("\nTest complete. Close window to exit.")
    app.exec()


if __name__ == "__main__":
    test_multiview()
