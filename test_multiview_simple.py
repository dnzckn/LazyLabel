#!/usr/bin/env python3
"""
Simple test for multi-view AI mode to debug the specific issues.
"""

import os
import sys

# Add the src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from PyQt6.QtCore import QPointF, Qt, QTimer
from PyQt6.QtWidgets import QApplication

from lazylabel.ui.main_window import MainWindow


def test_multiview_ai():
    """Test multi-view AI functionality step by step."""
    app = QApplication(sys.argv)

    # Create main window (it initializes its own components)
    main_window = MainWindow()

    print("🔧 LazyLabel Multi-View AI Test")
    print("=" * 40)

    # Load a test directory
    test_dir = "/home/deniz/python_projects/GitHub/LazyLabel"
    main_window.open_folder(test_dir)
    main_window.show()

    # Create a timer to run tests after window is shown
    def run_tests():
        print("\n1️⃣ Switching to multi-view mode...")
        main_window.view_tab_widget.setCurrentIndex(1)
        QApplication.processEvents()

        # Check if models are loaded (should be empty with lazy loading)
        if hasattr(main_window, 'multi_view_models'):
            print(f"   Models loaded: {len(main_window.multi_view_models)}")
        else:
            print("   No models loaded yet (lazy loading ✅)")

        # Wait a bit
        QTimer.singleShot(1000, test_ai_mode)

    def test_ai_mode():
        print("\n2️⃣ Entering AI mode...")
        main_window.set_sam_mode()
        QApplication.processEvents()

        print(f"   Current mode: {main_window.mode}")

        # Wait a bit then test AI click
        QTimer.singleShot(1000, test_ai_click)

    def test_ai_click():
        print("\n3️⃣ Simulating AI click...")

        # Create mock event
        mock_event = type('MockEvent', (), {
            'button': lambda: Qt.MouseButton.LeftButton,
            'timestamp': lambda: 0
        })()

        # Try to click
        pos = QPointF(100, 100)
        main_window._handle_multi_view_ai_click(pos, 0, mock_event)
        QApplication.processEvents()

        # Check model loading status
        if hasattr(main_window, 'multi_view_init_worker') and main_window.multi_view_init_worker:
            print("   Model loading started ✅")

            # Monitor loading progress
            def check_loading():
                if hasattr(main_window, 'multi_view_models') and len(main_window.multi_view_models) > 0:
                    print(f"\n4️⃣ Models loaded: {len(main_window.multi_view_models)}")
                    for i, model in enumerate(main_window.multi_view_models):
                        if model:
                            print(f"   Model {i}: ✅ Loaded")
                        else:
                            print(f"   Model {i}: ❌ None")

                    # Test escape key
                    QTimer.singleShot(1000, test_escape)
                else:
                    print("   Still loading...")
                    QTimer.singleShot(1000, check_loading)

            QTimer.singleShot(2000, check_loading)
        else:
            print("   Model loading did not start ❌")

    def test_escape():
        print("\n5️⃣ Testing escape key...")

        # Add some test points
        if hasattr(main_window, 'multi_view_positive_points'):
            main_window.multi_view_positive_points[0].append([50, 50])
            print("   Added test point")

        # Clear
        main_window.clear_all_points()
        QApplication.processEvents()

        # Check
        if hasattr(main_window, 'multi_view_positive_points'):
            if len(main_window.multi_view_positive_points[0]) == 0:
                print("   Points cleared ✅")
            else:
                print("   Points NOT cleared ❌")

        print("\n✅ Test complete! Window stays open for manual testing.")

    # Start tests after window is shown
    QTimer.singleShot(500, run_tests)

    # Run the app
    sys.exit(app.exec())


if __name__ == "__main__":
    test_multiview_ai()
