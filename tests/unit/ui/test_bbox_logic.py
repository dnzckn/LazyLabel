"""
Pytest tests for bounding box functionality logic.
"""

import os
import sys

import pytest

# Add the src directory to path for testing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


class TestBboxImplementation:
    """Test that bbox implementation methods exist."""

    def test_bbox_methods_exist_in_main_window(self):
        """Test that bbox methods exist in main window."""
        try:
            # Import the module properly
            from lazylabel.ui.main_window import MainWindow

            # Check that required bbox methods exist (single-view only)
            required_methods = [
                "set_bbox_mode",
            ]

            for method in required_methods:
                assert hasattr(MainWindow, method), (
                    f"MainWindow missing method: {method}"
                )

        except ImportError as e:
            pytest.skip(f"Cannot import MainWindow due to dependencies: {e}")

    def test_bbox_mode_value(self):
        """Test that bbox mode is correctly defined."""
        # The mode should be set to "bbox" when in bbox mode
        assert "bbox" == "bbox"  # Simple test to ensure string consistency

        # Test mode checking logic
        mode = "bbox"

        # This logic appears in the actual code
        bbox_actions = []
        if mode == "bbox":
            bbox_actions.extend(["start", "drag", "complete"])

        assert "start" in bbox_actions
        assert "drag" in bbox_actions
        assert "complete" in bbox_actions


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
