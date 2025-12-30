"""Application context for dependency injection.

This module provides a central container for application-wide dependencies,
enabling managers and components to access shared resources without direct
coupling to the MainWindow.

Usage:
    # In MainWindow initialization:
    context = AppContext(
        segment_manager=self.segment_manager,
        model_manager=self.model_manager,
        file_manager=self.file_manager,
        undo_redo_manager=self.undo_redo_manager,
    )

    # In manager initialization:
    def __init__(self, context: AppContext):
        self.segment_manager = context.segment_manager
        self.model_manager = context.model_manager
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..config import HotkeyManager, Paths, Settings
    from .file_manager import FileManager
    from .model_manager import ModelManager
    from .segment_manager import SegmentManager
    from .undo_redo_manager import UndoRedoManager


@dataclass
class AppContext:
    """Central container for application-wide dependencies.

    This class provides a clean way to pass dependencies to managers
    without requiring them to have a direct reference to MainWindow.

    Attributes:
        segment_manager: Manages segment data (add, remove, update)
        model_manager: Manages AI model lifecycle
        file_manager: Manages file I/O operations
        undo_redo_manager: Manages undo/redo operations
        paths: Application paths configuration
        settings: Application settings
        hotkey_manager: Keyboard shortcut configuration
    """

    # Core managers (required)
    segment_manager: SegmentManager
    model_manager: ModelManager
    file_manager: FileManager

    # Optional managers (set later in initialization)
    undo_redo_manager: UndoRedoManager | None = None

    # Configuration (optional, can be set later)
    paths: Paths | None = None
    settings: Settings | None = None
    hotkey_manager: HotkeyManager | None = None

    # UI state (lazily populated)
    _ui_state: dict[str, Any] = field(default_factory=dict)

    def set_undo_redo_manager(self, manager: UndoRedoManager) -> None:
        """Set the undo/redo manager after initialization.

        Args:
            manager: The UndoRedoManager instance
        """
        self.undo_redo_manager = manager

    def set_paths(self, paths: Paths) -> None:
        """Set the paths configuration.

        Args:
            paths: Application paths configuration
        """
        self.paths = paths

    def set_settings(self, settings: Settings) -> None:
        """Set the settings configuration.

        Args:
            settings: Application settings
        """
        self.settings = settings

    def set_hotkey_manager(self, manager: HotkeyManager) -> None:
        """Set the hotkey manager.

        Args:
            manager: The HotkeyManager instance
        """
        self.hotkey_manager = manager

    # ========== UI State Accessors ==========

    def set_ui_state(self, key: str, value: Any) -> None:
        """Store a UI state value.

        Args:
            key: State key name
            value: State value
        """
        self._ui_state[key] = value

    def get_ui_state(self, key: str, default: Any = None) -> Any:
        """Retrieve a UI state value.

        Args:
            key: State key name
            default: Default value if key not found

        Returns:
            The state value or default
        """
        return self._ui_state.get(key, default)

    def has_ui_state(self, key: str) -> bool:
        """Check if a UI state key exists.

        Args:
            key: State key name

        Returns:
            True if key exists
        """
        return key in self._ui_state


@dataclass
class UIContext:
    """Container for UI-specific dependencies.

    This provides access to UI components without requiring
    managers to know about the full MainWindow structure.

    Attributes:
        viewer: Primary photo viewer
        control_panel: Left control panel
        right_panel: Right panel with file browser and segment table
        notification_manager: Handles user notifications
    """

    # UI Components (set during initialization)
    viewer: Any = None
    control_panel: Any = None
    right_panel: Any = None
    notification_manager: Any = None
    status_bar: Any = None

    # Multi-view components (optional)
    multi_view_viewers: list = field(default_factory=list)
    multi_view_info_labels: list = field(default_factory=list)

    def set_viewer(self, viewer: Any) -> None:
        """Set the primary viewer.

        Args:
            viewer: PhotoViewer instance
        """
        self.viewer = viewer

    def set_control_panel(self, panel: Any) -> None:
        """Set the control panel.

        Args:
            panel: ControlPanel instance
        """
        self.control_panel = panel

    def set_right_panel(self, panel: Any) -> None:
        """Set the right panel.

        Args:
            panel: RightPanel instance
        """
        self.right_panel = panel

    def set_notification_manager(self, manager: Any) -> None:
        """Set the notification manager.

        Args:
            manager: NotificationManager instance
        """
        self.notification_manager = manager

    def set_multi_view_viewers(self, viewers: list) -> None:
        """Set the multi-view viewers.

        Args:
            viewers: List of PhotoViewer instances
        """
        self.multi_view_viewers = viewers

    def get_viewer(self, index: int | None = None) -> Any:
        """Get a viewer by index.

        Args:
            index: Viewer index (None for primary single-view viewer)

        Returns:
            The viewer at the given index, or primary viewer if index is None
        """
        if index is None:
            return self.viewer
        if 0 <= index < len(self.multi_view_viewers):
            return self.multi_view_viewers[index]
        return None


@dataclass
class FullContext:
    """Combined application and UI context.

    This provides a single point of access to all application resources.
    """

    app: AppContext
    ui: UIContext = field(default_factory=UIContext)

    @property
    def segment_manager(self) -> SegmentManager:
        """Shortcut to segment manager."""
        return self.app.segment_manager

    @property
    def model_manager(self) -> ModelManager:
        """Shortcut to model manager."""
        return self.app.model_manager

    @property
    def file_manager(self) -> FileManager:
        """Shortcut to file manager."""
        return self.app.file_manager

    @property
    def undo_redo_manager(self) -> UndoRedoManager | None:
        """Shortcut to undo/redo manager."""
        return self.app.undo_redo_manager

    @property
    def viewer(self) -> Any:
        """Shortcut to primary viewer."""
        return self.ui.viewer

    @property
    def control_panel(self) -> Any:
        """Shortcut to control panel."""
        return self.ui.control_panel

    @property
    def right_panel(self) -> Any:
        """Shortcut to right panel."""
        return self.ui.right_panel
