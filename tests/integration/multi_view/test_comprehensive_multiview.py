#!/usr/bin/env python3
"""Comprehensive test for multi-view functionality including hover, AI, and spacebar."""

import logging
import os
import sys
import time

from PyQt6.QtCore import QPointF, Qt
from PyQt6.QtWidgets import QApplication

# Add the src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from lazylabel.ui.main_window import MainWindow  # noqa: E402

# Enable debug logging
logging.basicConfig(level=logging.DEBUG)


class MultiViewTester:
    def __init__(self):
        self.app = QApplication(sys.argv)
        self.window = MainWindow()
        self.results = []

    def log_result(self, test_name, passed, details=""):
        result = {"test": test_name, "passed": passed, "details": details}
        self.results.append(result)
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {test_name}: {details}")

    def test_view_switching(self):
        """Test switching between single and multi view."""
        print("\n🔍 Testing view switching...")

        # Start in single view
        self.window.view_tab_widget.setCurrentIndex(0)
        QApplication.processEvents()

        single_mode = self.window.view_mode == "single"
        self.log_result(
            "Single view mode", single_mode, f"view_mode={self.window.view_mode}"
        )

        # Switch to multi view
        self.window.view_tab_widget.setCurrentIndex(1)
        QApplication.processEvents()
        time.sleep(0.5)

        multi_mode = self.window.view_mode == "multi"
        multi_viewers = (
            hasattr(self.window, "multi_view_viewers")
            and len(self.window.multi_view_viewers) == 2
        )
        self.log_result(
            "Multi view mode",
            multi_mode and multi_viewers,
            f"view_mode={self.window.view_mode}, viewers={len(self.window.multi_view_viewers) if hasattr(self.window, 'multi_view_viewers') else 0}",
        )

    def test_mode_switching(self):
        """Test switching between AI, polygon, and bbox modes."""
        print("\n🔍 Testing mode switching...")

        # Test AI mode
        self.window.set_sam_mode()
        QApplication.processEvents()
        ai_mode = self.window.mode == "ai"
        self.log_result("AI mode", ai_mode, f"mode={self.window.mode}")

        # Test polygon mode
        self.window.set_polygon_mode()
        QApplication.processEvents()
        poly_mode = self.window.mode == "polygon"
        self.log_result("Polygon mode", poly_mode, f"mode={self.window.mode}")

        # Test bbox mode
        self.window.set_bbox_mode()
        QApplication.processEvents()
        bbox_mode = self.window.mode == "bbox"
        self.log_result("Bbox mode", bbox_mode, f"mode={self.window.mode}")

    def test_polygon_creation(self):
        """Test polygon creation and mirroring."""
        print("\n🔍 Testing polygon creation...")

        # Switch to multi-view polygon mode
        self.window.view_tab_widget.setCurrentIndex(1)
        self.window.set_polygon_mode()
        QApplication.processEvents()

        # Create test points
        test_points = [
            QPointF(100, 100),
            QPointF(200, 100),
            QPointF(200, 200),
            QPointF(100, 200),
        ]

        # Add points to viewer 0
        self.window.multi_view_polygon_points[0] = test_points.copy()

        # Finalize polygon
        initial_segments = len(self.window.segment_manager.segments)
        self.window._finalize_multi_view_polygon(0)
        QApplication.processEvents()

        # Check if segment was created
        segments_created = len(self.window.segment_manager.segments) > initial_segments
        self.log_result(
            "Polygon segment created",
            segments_created,
            f"segments: {initial_segments} -> {len(self.window.segment_manager.segments)}",
        )

        # Check if segment has views structure
        if segments_created:
            last_segment = self.window.segment_manager.segments[-1]
            has_views = "views" in last_segment
            both_views = (
                has_views and 0 in last_segment["views"] and 1 in last_segment["views"]
            )
            self.log_result(
                "Polygon mirrored to both views",
                both_views,
                f"has_views={has_views}, views={list(last_segment['views'].keys()) if has_views else []}",
            )

    def test_ai_model_loading(self):
        """Test AI model lazy loading."""
        print("\n🔍 Testing AI model loading...")

        # Switch to multi-view AI mode
        self.window.view_tab_widget.setCurrentIndex(1)
        self.window.set_sam_mode()
        QApplication.processEvents()

        # Check initial state
        has_models = hasattr(self.window, "multi_view_models")
        self.log_result("Multi-view models attribute exists", has_models)

        # Simulate AI click to trigger loading
        mock_event = type(
            "MockEvent",
            (),
            {"button": lambda: Qt.MouseButton.LeftButton, "timestamp": lambda: 0},
        )()

        self.window._handle_multi_view_ai_click(QPointF(100, 100), 0, mock_event)
        QApplication.processEvents()

        # Check if initialization started
        init_started = (
            hasattr(self.window, "multi_view_init_worker")
            and self.window.multi_view_init_worker is not None
        )
        self.log_result("AI model initialization started", init_started)

    def test_hover_setup(self):
        """Test hover functionality setup."""
        print("\n🔍 Testing hover setup...")

        # Create a polygon to test hover
        self.test_polygon_creation()

        # Check segment items
        has_segment_items = hasattr(self.window, "multi_view_segment_items")
        self.log_result("Multi-view segment items exist", has_segment_items)

        if has_segment_items:
            total_items = sum(
                len(segments)
                for segments in self.window.multi_view_segment_items.values()
            )
            self.log_result(
                "Segment items created", total_items > 0, f"total items: {total_items}"
            )

            # Check if items have hover setup
            hover_setup = False
            for viewer_segments in self.window.multi_view_segment_items.values():
                for segment_items in viewer_segments.values():
                    for item in segment_items:
                        if hasattr(item, "segment_id") and hasattr(item, "main_window"):
                            hover_setup = True
                            break

            self.log_result("Hover attributes set on items", hover_setup)

    def test_spacebar_handling(self):
        """Test spacebar functionality."""
        print("\n🔍 Testing spacebar handling...")

        # Test in polygon mode
        self.window.set_polygon_mode()
        QApplication.processEvents()

        # Add some points
        self.window.multi_view_polygon_points[0] = [
            QPointF(50, 50),
            QPointF(150, 50),
            QPointF(150, 150),
            QPointF(50, 150),
        ]

        initial_segments = len(self.window.segment_manager.segments)

        # Simulate spacebar
        self.window._handle_space_press()
        QApplication.processEvents()

        polygon_spacebar = len(self.window.segment_manager.segments) > initial_segments
        self.log_result(
            "Spacebar works in polygon mode",
            polygon_spacebar,
            f"segments: {initial_segments} -> {len(self.window.segment_manager.segments)}",
        )

    def run_all_tests(self):
        """Run all tests."""
        print("\n" + "=" * 60)
        print("🚀 MULTI-VIEW COMPREHENSIVE TEST SUITE")
        print("=" * 60)

        # Load test images
        test_dir = "/home/deniz/python_projects/GitHub/LazyLabel/test_images"
        if os.path.exists(test_dir):
            self.window.open_folder(test_dir)

        self.window.show()
        QApplication.processEvents()

        # Run tests
        self.test_view_switching()
        self.test_mode_switching()
        self.test_polygon_creation()
        self.test_ai_model_loading()
        self.test_hover_setup()
        self.test_spacebar_handling()

        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)

        passed = sum(1 for r in self.results if r["passed"])
        total = len(self.results)

        print(f"Passed: {passed}/{total}")
        print(f"Failed: {total - passed}/{total}")
        print(f"Success Rate: {(passed / total * 100):.1f}%")

        # Show window for manual testing
        print("\n💡 Window remains open for manual testing.")
        print("Test hover by creating segments and hovering over them.")
        print("Close window when done.")

        return self.app.exec()


if __name__ == "__main__":
    tester = MultiViewTester()
    sys.exit(tester.run_all_tests())
