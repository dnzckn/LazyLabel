"""Protocol definitions for dependency injection.

This module defines Protocol classes that specify the interfaces managers
and other components depend on. Using protocols instead of concrete classes
enables better testability and looser coupling.

Usage:
    Instead of:
        def __init__(self, main_window: MainWindow):
            self.mw = main_window

    Use:
        def __init__(self, context: AppContext):
            self.context = context
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

if TYPE_CHECKING:
    from PyQt6.QtCore import QPointF
    from PyQt6.QtGui import QPixmap
    from PyQt6.QtWidgets import QGraphicsItem, QGraphicsScene


# ========== Core Component Protocols ==========


@runtime_checkable
class SegmentManagerProtocol(Protocol):
    """Protocol for segment data management."""

    @property
    def segments(self) -> list[dict]: ...

    def add_segment(self, segment_data: dict) -> int: ...

    def remove_segment(self, index: int) -> dict | None: ...

    def update_segment(self, index: int, segment_data: dict) -> bool: ...

    def clear(self) -> None: ...


@runtime_checkable
class UndoRedoManagerProtocol(Protocol):
    """Protocol for undo/redo operations."""

    def record_action(self, action: dict) -> None: ...

    def undo(self) -> bool: ...

    def redo(self) -> bool: ...

    def can_undo(self) -> bool: ...

    def can_redo(self) -> bool: ...


@runtime_checkable
class FileManagerProtocol(Protocol):
    """Protocol for file operations."""

    def is_image_file(self, path: str) -> bool: ...

    def load_existing_mask(self, image_path: str) -> None: ...

    def load_class_aliases(self, image_path: str) -> None: ...


@runtime_checkable
class ModelManagerProtocol(Protocol):
    """Protocol for AI model management."""

    def is_model_available(self) -> bool: ...

    def get_model(self) -> Any: ...

    def get_model_name(self) -> str: ...


# ========== UI Component Protocols ==========


@runtime_checkable
class ViewerProtocol(Protocol):
    """Protocol for photo viewer components."""

    def scene(self) -> QGraphicsScene: ...

    def set_photo(self, pixmap: QPixmap) -> None: ...

    def get_current_pixmap(self) -> QPixmap | None: ...

    def fitInView(self, scale: bool = True) -> None: ...

    def mapToScene(self, point: Any) -> QPointF: ...


@runtime_checkable
class NotificationProtocol(Protocol):
    """Protocol for user notifications."""

    def show_notification(self, message: str) -> None: ...

    def show_success(self, message: str) -> None: ...

    def show_warning(self, message: str) -> None: ...

    def show_error(self, message: str) -> None: ...


# ========== State Protocols ==========


@runtime_checkable
class ModeStateProtocol(Protocol):
    """Protocol for accessing current mode state."""

    @property
    def mode(self) -> str: ...

    @property
    def view_mode(self) -> str: ...


@runtime_checkable
class AnnotationStateProtocol(Protocol):
    """Protocol for accessing annotation settings."""

    @property
    def point_radius(self) -> float: ...

    @property
    def line_thickness(self) -> float: ...

    @property
    def polygon_join_threshold(self) -> float: ...

    @property
    def fragment_threshold(self) -> int: ...


@runtime_checkable
class DrawingStateProtocol(Protocol):
    """Protocol for polygon/point drawing state."""

    @property
    def polygon_points(self) -> list: ...

    @property
    def polygon_preview_items(self) -> list: ...

    @property
    def positive_points(self) -> list: ...

    @property
    def negative_points(self) -> list: ...

    @property
    def point_items(self) -> list: ...


@runtime_checkable
class SegmentDisplayStateProtocol(Protocol):
    """Protocol for segment display state."""

    @property
    def segment_items(self) -> dict[int, list[QGraphicsItem]]: ...

    @property
    def highlight_items(self) -> list[QGraphicsItem]: ...

    @property
    def edit_handles(self) -> list: ...


# ========== Multi-View Protocols ==========


@runtime_checkable
class MultiViewStateProtocol(Protocol):
    """Protocol for multi-view mode state."""

    @property
    def multi_view_viewers(self) -> list[ViewerProtocol]: ...

    @property
    def multi_view_images(self) -> list[str | None]: ...

    @property
    def multi_view_linked(self) -> list[bool]: ...


# ========== Scene Operation Protocols ==========


@runtime_checkable
class SceneOperationsProtocol(Protocol):
    """Protocol for scene manipulation operations."""

    def add_item_to_scene(self, item: QGraphicsItem) -> None: ...

    def remove_item_from_scene(self, item: QGraphicsItem) -> bool: ...

    def clear_scene_items(self, items: list[QGraphicsItem]) -> int: ...


# ========== Callback Protocols ==========


@runtime_checkable
class UIUpdateCallbackProtocol(Protocol):
    """Protocol for UI update callbacks."""

    def update_all_lists(self, invalidate_cache: bool = True) -> None: ...

    def update_lists_incremental(
        self,
        added_segment_index: int | None = None,
        removed_indices: list[int] | None = None,
    ) -> None: ...

    def display_all_segments(self) -> None: ...

    def clear_all_points(self) -> None: ...
