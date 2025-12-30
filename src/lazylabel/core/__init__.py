"""Core business logic for LazyLabel."""

from .app_context import AppContext, FullContext, UIContext
from .exceptions import (
    ConfigurationError,
    FileFormatError,
    FileOperationError,
    FileSaveError,
    HotkeyError,
    LazyLabelError,
    ModelError,
    ModelInferenceError,
    ModelLoadError,
    ModelNotLoadedError,
    SceneError,
    SegmentError,
    SegmentNotFoundError,
    SegmentOperationError,
    SegmentValidationError,
    SettingsError,
    UIError,
    ViewerError,
    WorkerCancellationError,
    WorkerError,
    WorkerTimeoutError,
)
from .file_manager import FileManager
from .model_manager import ModelManager
from .protocols import (
    AnnotationStateProtocol,
    DrawingStateProtocol,
    FileManagerProtocol,
    ModelManagerProtocol,
    ModeStateProtocol,
    MultiViewStateProtocol,
    NotificationProtocol,
    SceneOperationsProtocol,
    SegmentDisplayStateProtocol,
    SegmentManagerProtocol,
    UIUpdateCallbackProtocol,
    UndoRedoManagerProtocol,
    ViewerProtocol,
)
from .segment_manager import SegmentManager
from .undo_redo_manager import UndoRedoManager

__all__ = [
    # Core managers
    "SegmentManager",
    "ModelManager",
    "FileManager",
    "UndoRedoManager",
    # Context containers
    "AppContext",
    "UIContext",
    "FullContext",
    # Protocols
    "SegmentManagerProtocol",
    "UndoRedoManagerProtocol",
    "FileManagerProtocol",
    "ModelManagerProtocol",
    "ViewerProtocol",
    "NotificationProtocol",
    "ModeStateProtocol",
    "AnnotationStateProtocol",
    "DrawingStateProtocol",
    "SegmentDisplayStateProtocol",
    "MultiViewStateProtocol",
    "SceneOperationsProtocol",
    "UIUpdateCallbackProtocol",
    # Base exceptions
    "LazyLabelError",
    # Segment exceptions
    "SegmentError",
    "SegmentNotFoundError",
    "SegmentValidationError",
    "SegmentOperationError",
    # Model exceptions
    "ModelError",
    "ModelNotLoadedError",
    "ModelLoadError",
    "ModelInferenceError",
    # File exceptions
    "FileOperationError",
    "FileFormatError",
    "FileSaveError",
    # UI exceptions
    "UIError",
    "SceneError",
    "ViewerError",
    # Worker exceptions
    "WorkerError",
    "WorkerTimeoutError",
    "WorkerCancellationError",
    # Configuration exceptions
    "ConfigurationError",
    "SettingsError",
    "HotkeyError",
]
