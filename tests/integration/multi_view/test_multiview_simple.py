#!/usr/bin/env python3
"""
Test for multi-view AI mode functionality - mock-based tests without GUI.
"""

import os
import sys
from unittest.mock import MagicMock, patch

# Add the src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

import pytest
from PyQt6.QtCore import QPointF, Qt

# Don't import QApplication to avoid GUI dependencies


def test_multiview_ai_initialization():
    """Test multi-view AI mode initialization without GUI."""
    
    # Create a completely mocked main window
    mock_main_window = MagicMock()
    mock_main_window.view_mode = "multi"
    mock_main_window.mode = "ai"
    mock_main_window.multi_view_models = []
    mock_main_window.multi_view_models_updating = [False, False]
    mock_main_window.multi_view_models_dirty = [False, False]
    
    # Test AI mode functionality
    from lazylabel.ui.modes.multi_view_mode import MultiViewModeHandler
    handler = MultiViewModeHandler(mock_main_window)
    
    # Verify handler was created
    assert handler is not None
    assert handler.main_window == mock_main_window


def test_multiview_ai_point_accumulation():
    """Test that multiview AI mode properly accumulates points."""
    
    # Create a completely mocked setup
    mock_main_window = MagicMock()
    mock_main_window.multi_view_models = [MagicMock(), MagicMock()]
    mock_main_window.multi_view_viewers = [MagicMock(), MagicMock()]
    mock_main_window.multi_view_models_updating = [False, False]
    mock_main_window.multi_view_models_dirty = [False, False]
    mock_main_window.point_radius = 5
    mock_main_window.action_history = []
    mock_main_window.redo_history = []
    
    # Mock the scene
    mock_scene = MagicMock()
    mock_main_window.multi_view_viewers[0].scene.return_value = mock_scene
    
    # Mock coordinate transformation
    mock_main_window._transform_multi_view_coords_to_sam_coords.return_value = (10, 20)
    
    # Mock SAM model result
    import numpy as np
    mock_result = (
        np.ones((256, 256), dtype=bool),
        np.array([0.9]),
        np.random.rand(1, 256, 256),
    )
    mock_main_window.multi_view_models[0].predict.return_value = mock_result
    
    # Mock ALL GUI-related methods to prevent crashes
    mock_main_window._display_ai_preview = MagicMock()
    mock_main_window._generate_paired_ai_preview = MagicMock()
    
    # Create handler and test
    from lazylabel.ui.modes.multi_view_mode import MultiViewModeHandler
    handler = MultiViewModeHandler(mock_main_window)
    
    # Create mock right-click event
    mock_event = MagicMock()
    mock_event.button.return_value = Qt.MouseButton.RightButton
    
    pos = QPointF(100, 200)
    
    # Test negative point handling - patch the _display_ai_preview call
    with patch.object(handler, '_display_ai_preview'), \
         patch.object(handler, '_generate_paired_ai_preview'):
        handler.handle_ai_click(pos, mock_event, viewer_index=0)
    
    # Verify that point accumulation attributes were created
    assert hasattr(mock_main_window, 'multi_view_positive_points')
    assert hasattr(mock_main_window, 'multi_view_negative_points')
    
    # The attributes should now be real dictionaries with lists, not mocks
    assert isinstance(mock_main_window.multi_view_positive_points, dict)
    assert isinstance(mock_main_window.multi_view_negative_points, dict)
    
    # Verify the negative point was added
    assert len(mock_main_window.multi_view_negative_points[0]) == 1
    assert mock_main_window.multi_view_negative_points[0][0] == (10, 20)
    
    # Verify SAM model was called with correct parameters
    mock_main_window.multi_view_models[0].predict.assert_called_once()
    call_args = mock_main_window.multi_view_models[0].predict.call_args[0]
    positive_points, negative_points = call_args
    
    assert len(positive_points) == 0  # No positive points yet
    assert len(negative_points) == 1  # One negative point
    assert negative_points[0] == (10, 20)


def test_multiview_point_clearing():
    """Test that multiview points are properly cleared."""
    
    # Create mock setup
    mock_main_window = MagicMock()
    mock_main_window.multi_view_positive_points = {0: [(10, 20)], 1: []}
    mock_main_window.multi_view_negative_points = {0: [(30, 40)], 1: []}
    mock_main_window.multi_view_point_items = {0: [MagicMock()], 1: []}
    mock_main_window.multi_view_ai_predictions = {}
    mock_main_window.multi_view_preview_items = {}
    
    # Mock viewer scene
    mock_main_window.multi_view_viewers = [MagicMock(), MagicMock()]
    mock_main_window.multi_view_point_items[0][0].scene.return_value = MagicMock()
    
    # Create handler and test clearing
    from lazylabel.ui.modes.multi_view_mode import MultiViewModeHandler
    handler = MultiViewModeHandler(mock_main_window)
    
    # Clear points
    handler._clear_ai_previews()
    
    # Verify points were cleared
    assert len(mock_main_window.multi_view_positive_points[0]) == 0
    assert len(mock_main_window.multi_view_negative_points[0]) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
