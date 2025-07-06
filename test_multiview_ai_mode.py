#!/usr/bin/env python3
"""
Comprehensive test for multi-view AI mode functionality in LazyLabel.
Tests lazy loading, operate-on-view, memory management, and all AI interactions.
"""

import os
import sys
import time
import traceback

# Add the src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from PyQt6.QtCore import QPointF, Qt
from PyQt6.QtWidgets import QApplication

from lazylabel.ui.main_window import MainWindow


class TestMultiViewAI:
    """Test class for multi-view AI mode functionality."""

    def __init__(self):
        self.app = QApplication(sys.argv)
        self.passed_tests = []
        self.failed_tests = []

    def setup_test_environment(self):
        """Set up the test environment with main window."""
        print("🔧 Setting up test environment...")

        # Create main window (it initializes its own components)
        self.main_window = MainWindow()

        # Access the initialized components
        self.settings = self.main_window.settings
        self.paths = self.main_window.paths
        self.model_manager = self.main_window.model_manager
        self.segment_manager = self.main_window.segment_manager
        self.file_manager = self.main_window.file_manager

        # Load test images directory
        test_dir = "/home/deniz/python_projects/GitHub/LazyLabel/test_images"
        if not os.path.exists(test_dir):
            print(f"❌ Test directory not found: {test_dir}")
            print("Creating test directory with sample images...")
            os.makedirs(test_dir, exist_ok=True)
            # You'll need to add some test images here

        self.main_window.open_folder(test_dir)
        self.main_window.show()

        print("✅ Test environment ready")

    def test_1_lazy_loading(self):
        """Test 1: Verify lazy loading - models don't load until AI mode is used."""
        print("\n📋 Test 1: Lazy Loading")

        try:
            # Switch to multi-view mode
            print("  - Switching to multi-view mode...")
            self.main_window.view_tab_widget.setCurrentIndex(1)
            QApplication.processEvents()
            time.sleep(0.5)

            # Check that models are NOT loaded yet
            if not hasattr(self.main_window, 'multi_view_models') or len(self.main_window.multi_view_models) == 0:
                print("  ✅ Models not loaded on multi-view switch (lazy loading working)")
                self.passed_tests.append("Lazy loading")
            else:
                print("  ❌ Models loaded immediately (lazy loading failed)")
                self.failed_tests.append("Lazy loading")

        except Exception as e:
            print(f"  ❌ Error in lazy loading test: {e}")
            self.failed_tests.append("Lazy loading")
            traceback.print_exc()

    def test_2_ai_mode_entry(self):
        """Test 2: Verify AI mode can be entered without warnings."""
        print("\n📋 Test 2: AI Mode Entry")

        try:
            # Try to enter AI mode
            print("  - Entering AI mode...")
            self.main_window.set_sam_mode()
            QApplication.processEvents()

            if self.main_window.mode == "ai":
                print("  ✅ AI mode entered successfully")
                self.passed_tests.append("AI mode entry")
            else:
                print(f"  ❌ Failed to enter AI mode, current mode: {self.main_window.mode}")
                self.failed_tests.append("AI mode entry")

        except Exception as e:
            print(f"  ❌ Error entering AI mode: {e}")
            self.failed_tests.append("AI mode entry")
            traceback.print_exc()

    def test_3_model_loading_on_first_use(self):
        """Test 3: Verify models load on first AI interaction."""
        print("\n📋 Test 3: Model Loading on First Use")

        try:
            # Simulate AI click on viewer 0
            print("  - Simulating AI click on viewer 0...")

            # Create mock mouse event
            mock_event = type('MockEvent', (), {
                'button': lambda: Qt.MouseButton.LeftButton,
                'timestamp': lambda: 0
            })()

            # Simulate click at position
            pos = QPointF(100, 100)
            self.main_window._handle_multi_view_ai_click(pos, 0, mock_event)
            QApplication.processEvents()

            # Check if initialization started
            if hasattr(self.main_window, 'multi_view_init_worker') and self.main_window.multi_view_init_worker:
                print("  ✅ Model initialization started on first AI use")

                # Wait for models to load (with timeout)
                print("  - Waiting for models to load...")
                start_time = time.time()
                timeout = 30  # 30 seconds timeout

                while time.time() - start_time < timeout:
                    QApplication.processEvents()
                    if (hasattr(self.main_window, 'multi_view_models') and
                        len(self.main_window.multi_view_models) >= 2 and
                        all(model is not None for model in self.main_window.multi_view_models[:2])):
                        print(f"  ✅ Models loaded successfully in {time.time() - start_time:.1f} seconds")
                        self.passed_tests.append("Model loading on first use")
                        break
                    time.sleep(0.1)
                else:
                    print("  ❌ Model loading timed out")
                    self.failed_tests.append("Model loading on first use")
            else:
                print("  ❌ Model initialization did not start")
                self.failed_tests.append("Model loading on first use")

        except Exception as e:
            print(f"  ❌ Error in model loading test: {e}")
            self.failed_tests.append("Model loading on first use")
            traceback.print_exc()

    def test_4_ai_point_functionality(self):
        """Test 4: Test AI point placement (positive and negative)."""
        print("\n📋 Test 4: AI Point Functionality")

        try:
            # Wait for models to be ready
            if not self._wait_for_models():
                print("  ❌ Models not ready, skipping test")
                self.failed_tests.append("AI point functionality")
                return

            # Test positive point
            print("  - Testing positive point on viewer 0...")
            pos = QPointF(150, 150)
            mock_event = type('MockEvent', (), {
                'button': lambda: Qt.MouseButton.LeftButton,
                'timestamp': lambda: 0
            })()

            self.main_window._handle_multi_view_ai_click(pos, 0, mock_event)
            self.main_window._handle_multi_view_ai_release(pos, 0)
            QApplication.processEvents()
            time.sleep(0.5)

            # Check if point was added
            if (hasattr(self.main_window, 'multi_view_positive_points') and
                len(self.main_window.multi_view_positive_points[0]) > 0):
                print("  ✅ Positive point added successfully")
            else:
                print("  ❌ Positive point not added")

            # Test negative point
            print("  - Testing negative point on viewer 1...")
            pos2 = QPointF(200, 200)
            mock_event2 = type('MockEvent', (), {
                'button': lambda: Qt.MouseButton.RightButton,
                'timestamp': lambda: 0
            })()

            self.main_window._handle_multi_view_ai_click(pos2, 1, mock_event2)
            self.main_window._handle_multi_view_ai_release(pos2, 1)
            QApplication.processEvents()
            time.sleep(0.5)

            # Check if negative point was added
            if (hasattr(self.main_window, 'multi_view_negative_points') and
                len(self.main_window.multi_view_negative_points[1]) > 0):
                print("  ✅ Negative point added successfully")
                self.passed_tests.append("AI point functionality")
            else:
                print("  ❌ Negative point not added")
                self.failed_tests.append("AI point functionality")

        except Exception as e:
            print(f"  ❌ Error in point functionality test: {e}")
            self.failed_tests.append("AI point functionality")
            traceback.print_exc()

    def test_5_ai_bbox_functionality(self):
        """Test 5: Test AI bounding box functionality."""
        print("\n📋 Test 5: AI Bounding Box Functionality")

        try:
            if not self._wait_for_models():
                print("  ❌ Models not ready, skipping test")
                self.failed_tests.append("AI bbox functionality")
                return

            # Clear any existing points
            self.main_window.clear_all_points()
            QApplication.processEvents()

            # Simulate bbox drag on viewer 0
            print("  - Testing bounding box drag on viewer 0...")
            start_pos = QPointF(50, 50)
            end_pos = QPointF(250, 250)

            mock_event = type('MockEvent', (), {
                'button': lambda: Qt.MouseButton.LeftButton,
                'timestamp': lambda: 0
            })()

            # Start drag
            self.main_window._handle_multi_view_ai_click(start_pos, 0, mock_event)
            QApplication.processEvents()

            # Drag
            self.main_window._handle_multi_view_ai_drag(end_pos, 0)
            QApplication.processEvents()

            # Release
            self.main_window._handle_multi_view_ai_release(end_pos, 0)
            QApplication.processEvents()
            time.sleep(1)  # Wait for AI prediction

            # Check if AI prediction was generated
            if (hasattr(self.main_window, 'multi_view_ai_predictions') and
                0 in self.main_window.multi_view_ai_predictions):
                print("  ✅ AI bbox prediction generated")
                self.passed_tests.append("AI bbox functionality")
            else:
                print("  ❌ AI bbox prediction not generated")
                self.failed_tests.append("AI bbox functionality")

        except Exception as e:
            print(f"  ❌ Error in bbox functionality test: {e}")
            self.failed_tests.append("AI bbox functionality")
            traceback.print_exc()

    def test_6_escape_key_clearing(self):
        """Test 6: Test escape key clears AI points and previews."""
        print("\n📋 Test 6: Escape Key Clearing")

        try:
            # Add some points first
            print("  - Adding test points...")
            if hasattr(self.main_window, 'multi_view_positive_points'):
                self.main_window.multi_view_positive_points[0].append([100, 100])
                self.main_window.multi_view_negative_points[1].append([200, 200])

            # Clear with escape
            print("  - Clearing with escape key...")
            self.main_window.clear_all_points()
            QApplication.processEvents()

            # Check if cleared
            points_cleared = True
            if hasattr(self.main_window, 'multi_view_positive_points'):
                for points in self.main_window.multi_view_positive_points:
                    if len(points) > 0:
                        points_cleared = False
                        break

            if points_cleared:
                print("  ✅ Escape key cleared all points")
                self.passed_tests.append("Escape key clearing")
            else:
                print("  ❌ Escape key did not clear all points")
                self.failed_tests.append("Escape key clearing")

        except Exception as e:
            print(f"  ❌ Error in escape key test: {e}")
            self.failed_tests.append("Escape key clearing")
            traceback.print_exc()

    def test_7_operate_on_view(self):
        """Test 7: Test operate-on-view functionality."""
        print("\n📋 Test 7: Operate-on-View Functionality")

        try:
            # Enable operate-on-view
            print("  - Enabling operate-on-view...")
            self.main_window.settings.operate_on_view = True

            # Mark models as dirty to force update
            if hasattr(self.main_window, 'multi_view_models_dirty'):
                self.main_window.multi_view_models_dirty = [True, True]

            # Trigger model update
            print("  - Triggering model update with operate-on-view...")
            self.main_window._ensure_multi_view_sam_updated(0)
            QApplication.processEvents()

            # Check if modified image would be used
            if hasattr(self.main_window, '_get_multi_view_modified_image'):
                modified_image = self.main_window._get_multi_view_modified_image(0)
                if modified_image is not None:
                    print("  ✅ Operate-on-view can get modified image")
                    self.passed_tests.append("Operate-on-view")
                else:
                    print("  ❌ Could not get modified image")
                    self.failed_tests.append("Operate-on-view")
            else:
                print("  ❌ Operate-on-view method not found")
                self.failed_tests.append("Operate-on-view")

            # Disable operate-on-view
            self.main_window.settings.operate_on_view = False

        except Exception as e:
            print(f"  ❌ Error in operate-on-view test: {e}")
            self.failed_tests.append("Operate-on-view")
            traceback.print_exc()

    def test_8_memory_cleanup(self):
        """Test 8: Test memory cleanup when switching views."""
        print("\n📋 Test 8: Memory Cleanup")

        try:
            # Switch back to single view
            print("  - Switching back to single view...")
            self.main_window.view_tab_widget.setCurrentIndex(0)
            QApplication.processEvents()
            time.sleep(0.5)

            # Check if multi-view models were cleaned up
            if (not hasattr(self.main_window, 'multi_view_models') or
                len(self.main_window.multi_view_models) == 0):
                print("  ✅ Multi-view models cleaned up")
                self.passed_tests.append("Memory cleanup")
            else:
                print("  ❌ Multi-view models not cleaned up")
                self.failed_tests.append("Memory cleanup")

        except Exception as e:
            print(f"  ❌ Error in memory cleanup test: {e}")
            self.failed_tests.append("Memory cleanup")
            traceback.print_exc()

    def _wait_for_models(self, timeout=10):
        """Wait for models to be ready."""
        start_time = time.time()
        while time.time() - start_time < timeout:
            if (hasattr(self.main_window, 'multi_view_models') and
                len(self.main_window.multi_view_models) >= 2 and
                all(model is not None for model in self.main_window.multi_view_models[:2])):
                return True
            QApplication.processEvents()
            time.sleep(0.1)
        return False

    def run_all_tests(self):
        """Run all tests in sequence."""
        print("\n🚀 Starting Multi-View AI Mode Tests")
        print("=" * 50)

        self.setup_test_environment()

        # Run tests
        self.test_1_lazy_loading()
        self.test_2_ai_mode_entry()
        self.test_3_model_loading_on_first_use()
        self.test_4_ai_point_functionality()
        self.test_5_ai_bbox_functionality()
        self.test_6_escape_key_clearing()
        self.test_7_operate_on_view()
        self.test_8_memory_cleanup()

        # Print summary
        print("\n" + "=" * 50)
        print("📊 TEST SUMMARY")
        print("=" * 50)
        print(f"✅ Passed: {len(self.passed_tests)}")
        for test in self.passed_tests:
            print(f"   - {test}")

        print(f"\n❌ Failed: {len(self.failed_tests)}")
        for test in self.failed_tests:
            print(f"   - {test}")

        total_tests = len(self.passed_tests) + len(self.failed_tests)
        if total_tests > 0:
            success_rate = (len(self.passed_tests) / total_tests) * 100
            print(f"\n📈 Success Rate: {success_rate:.1f}%")

        # Keep window open for manual testing
        print("\n💡 Window will stay open for manual testing. Close when done.")

        return len(self.failed_tests) == 0


def main():
    """Run the test suite."""
    tester = TestMultiViewAI()
    success = tester.run_all_tests()

    # Run the app for manual testing
    sys.exit(tester.app.exec())


if __name__ == "__main__":
    main()
