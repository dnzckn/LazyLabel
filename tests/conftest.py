"""Test configuration for pytest."""

import os
import sys
from pathlib import Path

import pytest

# Add the src directory to the path so we can import the package
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def app(qapp):
    """Provide QApplication from pytest-qt for tests that need it.

    Uses pytest-qt's built-in qapp fixture which handles lifecycle properly.
    """
    return qapp


def pytest_sessionfinish(session, exitstatus):
    """Clean up Qt before session ends to prevent C++ runtime abort.

    This addresses the 'terminate called without an active exception' error
    that occurs with PyQt6 on Linux during Python shutdown.
    """
    from PyQt6.QtWidgets import QApplication

    app = QApplication.instance()
    if app is not None:
        # Process any pending events
        app.processEvents()
        # Close all windows
        for widget in app.topLevelWidgets():
            widget.close()
        app.processEvents()
        # Quit the application event loop
        app.quit()
        app.processEvents()


@pytest.fixture
def test_data_dir():
    """Return the path to the test data directory."""
    return Path(__file__).parent / "data"


@pytest.fixture
def sample_image_path(test_data_dir):
    """Return the path to a sample image for testing."""
    # Create test data directory if it doesn't exist
    test_data_dir.mkdir(exist_ok=True)
    return test_data_dir / "sample_image.png"
