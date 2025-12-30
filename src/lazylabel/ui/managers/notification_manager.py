"""Notification manager for displaying status bar messages."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..main_window import MainWindow


class NotificationManager:
    """Manages notification display through the status bar.

    Provides a clean interface for showing different types of notifications
    (info, error, success, warning) with configurable durations.
    """

    # Default durations in milliseconds
    DEFAULT_INFO_DURATION = 3000
    DEFAULT_ERROR_DURATION = 8000
    DEFAULT_SUCCESS_DURATION = 3000
    DEFAULT_WARNING_DURATION = 5000

    def __init__(self, main_window: MainWindow):
        self.main_window = main_window

    @property
    def status_bar(self):
        """Get the status bar from main window."""
        return self.main_window.status_bar

    def show(self, message: str, duration: int = DEFAULT_INFO_DURATION) -> None:
        """Show an info notification message.

        Args:
            message: The message to display
            duration: Duration in milliseconds (default: 3000)
        """
        self.status_bar.show_message(message, duration)

    def show_error(self, message: str, duration: int = DEFAULT_ERROR_DURATION) -> None:
        """Show an error notification message.

        Args:
            message: The error message to display
            duration: Duration in milliseconds (default: 8000)
        """
        self.status_bar.show_error_message(message, duration)

    def show_success(
        self, message: str, duration: int = DEFAULT_SUCCESS_DURATION
    ) -> None:
        """Show a success notification message.

        Args:
            message: The success message to display
            duration: Duration in milliseconds (default: 3000)
        """
        self.status_bar.show_success_message(message, duration)

    def show_warning(
        self, message: str, duration: int = DEFAULT_WARNING_DURATION
    ) -> None:
        """Show a warning notification message.

        Args:
            message: The warning message to display
            duration: Duration in milliseconds (default: 5000)
        """
        self.status_bar.show_warning_message(message, duration)

    def clear(self) -> None:
        """Clear the current notification from the status bar."""
        self.status_bar.clear_message()
