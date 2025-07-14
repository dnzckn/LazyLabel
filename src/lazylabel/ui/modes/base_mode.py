"""Base class for mode handlers."""

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..main_window import MainWindow


class BaseModeHandler(ABC):
    """Base class for mode handlers."""

    def __init__(self, main_window: "MainWindow"):
        self.main_window = main_window
        self.segment_manager = main_window.segment_manager
        self.model_manager = main_window.model_manager
        self.file_manager = main_window.file_manager

    @abstractmethod
    def handle_ai_click(self, pos, event):
        """Handle AI mode click."""
        pass

    @abstractmethod
    def handle_polygon_click(self, pos):
        """Handle polygon mode click."""
        pass

    @abstractmethod
    def handle_bbox_start(self, pos):
        """Handle bbox mode start."""
        pass

    @abstractmethod
    def handle_bbox_drag(self, pos):
        """Handle bbox mode drag."""
        pass

    @abstractmethod
    def handle_bbox_complete(self, pos):
        """Handle bbox mode completion."""
        pass

    @abstractmethod
    def display_all_segments(self):
        """Display all segments."""
        pass

    @abstractmethod
    def clear_all_points(self):
        """Clear all points."""
        pass
