"""SingleViewViewModel for MVVM architecture.

This ViewModel owns single-view state, emitting signals when state changes
to enable reactive UI updates. This completes the MVVM pattern started
with MultiViewViewModel.
"""

from __future__ import annotations

from PyQt6.QtCore import QModelIndex, QObject, pyqtSignal


class SingleViewViewModel(QObject):
    """ViewModel for single-view mode state.

    Owns and manages:
    - Current image path and loading state
    - Current mode (sam_points, polygon, bbox, etc.)
    - Loading indicators

    Emits signals for reactive UI binding:
    - image_changed: When the current image changes
    - mode_changed: When the annotation mode changes
    - loading_changed: When loading state changes
    """

    # Signals for reactive UI binding
    image_changed = pyqtSignal(str)  # Emits new image path
    image_cleared = pyqtSignal()  # Emits when no image is loaded
    mode_changed = pyqtSignal(str, str)  # Emits (old_mode, new_mode)
    loading_started = pyqtSignal()
    loading_finished = pyqtSignal()

    def __init__(self, parent: QObject | None = None):
        """Initialize the SingleViewViewModel.

        Args:
            parent: Optional parent QObject
        """
        super().__init__(parent)

        # Image state
        self._current_image_path: str | None = None
        self._is_loading: bool = False

        # Mode state
        self._current_mode: str = "sam_points"
        self._previous_mode: str = "sam_points"

        # File context
        self._current_file_index = QModelIndex()  # QModelIndex for file tree

    # ========== Image State ==========

    @property
    def current_image_path(self) -> str | None:
        """Get the current image path."""
        return self._current_image_path

    def set_image(self, path: str | None) -> None:
        """Set the current image path.

        Emits image_changed or image_cleared signal.

        Args:
            path: Path to the image, or None to clear
        """
        if path == self._current_image_path:
            return

        self._current_image_path = path

        if path:
            self.image_changed.emit(path)
        else:
            self.image_cleared.emit()

    def has_image(self) -> bool:
        """Check if an image is currently loaded."""
        return self._current_image_path is not None

    def get_image_filename(self) -> str | None:
        """Get just the filename of the current image."""
        if not self._current_image_path:
            return None
        import os

        return os.path.basename(self._current_image_path)

    # ========== Loading State ==========

    @property
    def is_loading(self) -> bool:
        """Check if currently loading."""
        return self._is_loading

    def set_loading(self, loading: bool) -> None:
        """Set the loading state.

        Emits loading_started or loading_finished signal.

        Args:
            loading: True if loading, False if done
        """
        if loading == self._is_loading:
            return

        self._is_loading = loading

        if loading:
            self.loading_started.emit()
        else:
            self.loading_finished.emit()

    # ========== Mode State ==========

    @property
    def current_mode(self) -> str:
        """Get the current annotation mode."""
        return self._current_mode

    @property
    def previous_mode(self) -> str:
        """Get the previous annotation mode (for toggle behavior)."""
        return self._previous_mode

    def set_mode(self, mode: str) -> None:
        """Set the current annotation mode.

        Emits mode_changed signal with (old_mode, new_mode).

        Args:
            mode: The new mode name
        """
        if mode == self._current_mode:
            return

        old_mode = self._current_mode
        self._previous_mode = old_mode
        self._current_mode = mode

        self.mode_changed.emit(old_mode, mode)

    def toggle_mode(self, mode: str) -> str:
        """Toggle to a mode, or back to previous if already in that mode.

        Args:
            mode: The mode to toggle to

        Returns:
            The mode that was set
        """
        if self._current_mode == mode:
            # Toggle back to previous mode
            self.set_mode(self._previous_mode)
            return self._current_mode
        else:
            # Switch to new mode
            self.set_mode(mode)
            return mode

    def is_mode(self, mode: str) -> bool:
        """Check if currently in a specific mode."""
        return self._current_mode == mode

    def is_ai_mode(self) -> bool:
        """Check if in an AI-based mode (sam_points or ai)."""
        return self._current_mode in ("sam_points", "ai")

    def is_drawing_mode(self) -> bool:
        """Check if in a drawing mode (polygon or bbox)."""
        return self._current_mode in ("polygon", "bbox")

    # ========== File Context ==========

    @property
    def current_file_index(self):
        """Get the current file index (QModelIndex)."""
        return self._current_file_index

    def set_file_index(self, index) -> None:
        """Set the current file index.

        Args:
            index: QModelIndex for the current file
        """
        self._current_file_index = index

    # ========== Utility Methods ==========

    def reset(self) -> None:
        """Reset to initial state."""
        self._current_image_path = None
        self._is_loading = False
        self._current_mode = "sam_points"
        self._previous_mode = "sam_points"
        self._current_file_index = QModelIndex()
        self.image_cleared.emit()
