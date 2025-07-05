"""Test configuration for pytest."""

import os
import sys
from pathlib import Path

import pytest

# Add the src directory to the path so we can import the package
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


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
