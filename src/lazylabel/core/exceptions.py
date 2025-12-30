"""Custom exceptions for LazyLabel.

This module defines a hierarchy of exceptions for different error categories,
enabling more precise error handling throughout the application.
"""

from __future__ import annotations


class LazyLabelError(Exception):
    """Base exception for all LazyLabel errors.

    All custom exceptions inherit from this class, allowing code to catch
    all LazyLabel-specific errors with a single except clause.
    """

    def __init__(self, message: str = "", *args, **kwargs):
        self.message = message
        super().__init__(message, *args, **kwargs)


# ========== Segment-related Errors ==========


class SegmentError(LazyLabelError):
    """Base class for segment operation errors."""


class SegmentNotFoundError(SegmentError):
    """Raised when a segment cannot be found by index or ID."""

    def __init__(self, segment_id: int | str, message: str = ""):
        self.segment_id = segment_id
        super().__init__(message or f"Segment not found: {segment_id}")


class SegmentValidationError(SegmentError):
    """Raised when segment data fails validation."""

    def __init__(self, reason: str, segment_data: dict | None = None):
        self.reason = reason
        self.segment_data = segment_data
        super().__init__(f"Invalid segment data: {reason}")


class SegmentOperationError(SegmentError):
    """Raised when a segment operation fails."""

    def __init__(self, operation: str, reason: str):
        self.operation = operation
        self.reason = reason
        super().__init__(f"Segment operation '{operation}' failed: {reason}")


# ========== Model-related Errors ==========


class ModelError(LazyLabelError):
    """Base class for AI model errors."""


class ModelNotLoadedError(ModelError):
    """Raised when trying to use a model that hasn't been loaded."""

    def __init__(self, model_name: str = ""):
        self.model_name = model_name
        super().__init__(
            f"Model not loaded: {model_name}" if model_name else "No model loaded"
        )


class ModelLoadError(ModelError):
    """Raised when a model fails to load."""

    def __init__(self, model_path: str, reason: str):
        self.model_path = model_path
        self.reason = reason
        super().__init__(f"Failed to load model '{model_path}': {reason}")


class ModelInferenceError(ModelError):
    """Raised when model inference fails."""

    def __init__(self, reason: str, input_shape: tuple | None = None):
        self.reason = reason
        self.input_shape = input_shape
        super().__init__(f"Model inference failed: {reason}")


# ========== File Operation Errors ==========


class FileOperationError(LazyLabelError):
    """Base class for file operation errors."""


class FileNotFoundError(FileOperationError):
    """Raised when a required file cannot be found."""

    def __init__(self, file_path: str):
        self.file_path = file_path
        super().__init__(f"File not found: {file_path}")


class FileFormatError(FileOperationError):
    """Raised when a file has an invalid or unsupported format."""

    def __init__(self, file_path: str, expected_format: str, actual_format: str = ""):
        self.file_path = file_path
        self.expected_format = expected_format
        self.actual_format = actual_format
        msg = f"Invalid file format for '{file_path}': expected {expected_format}"
        if actual_format:
            msg += f", got {actual_format}"
        super().__init__(msg)


class FileSaveError(FileOperationError):
    """Raised when saving a file fails."""

    def __init__(self, file_path: str, reason: str):
        self.file_path = file_path
        self.reason = reason
        super().__init__(f"Failed to save '{file_path}': {reason}")


# ========== UI/Scene Errors ==========


class UIError(LazyLabelError):
    """Base class for UI-related errors."""


class SceneError(UIError):
    """Raised when a scene operation fails."""

    def __init__(self, operation: str, reason: str):
        self.operation = operation
        self.reason = reason
        super().__init__(f"Scene operation '{operation}' failed: {reason}")


class ViewerError(UIError):
    """Raised when a viewer operation fails."""

    def __init__(self, viewer_index: int | None, reason: str):
        self.viewer_index = viewer_index
        self.reason = reason
        super().__init__(
            f"Viewer {viewer_index} error: {reason}"
            if viewer_index is not None
            else f"Viewer error: {reason}"
        )


# ========== Worker/Threading Errors ==========


class WorkerError(LazyLabelError):
    """Base class for background worker errors."""


class WorkerTimeoutError(WorkerError):
    """Raised when a worker operation times out."""

    def __init__(self, worker_name: str, timeout_ms: int):
        self.worker_name = worker_name
        self.timeout_ms = timeout_ms
        super().__init__(f"Worker '{worker_name}' timed out after {timeout_ms}ms")


class WorkerCancellationError(WorkerError):
    """Raised when a worker is cancelled during operation."""

    def __init__(self, worker_name: str):
        self.worker_name = worker_name
        super().__init__(f"Worker '{worker_name}' was cancelled")


# ========== Configuration Errors ==========


class ConfigurationError(LazyLabelError):
    """Base class for configuration errors."""


class SettingsError(ConfigurationError):
    """Raised when settings are invalid or cannot be loaded."""

    def __init__(self, setting_name: str, reason: str):
        self.setting_name = setting_name
        self.reason = reason
        super().__init__(f"Settings error for '{setting_name}': {reason}")


class HotkeyError(ConfigurationError):
    """Raised when hotkey configuration is invalid."""

    def __init__(self, action: str, reason: str):
        self.action = action
        self.reason = reason
        super().__init__(f"Hotkey error for action '{action}': {reason}")
