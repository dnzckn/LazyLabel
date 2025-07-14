"""Status bar widget for displaying active messages."""

from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import QLabel, QStatusBar


class StatusBar(QStatusBar):
    """Custom status bar for displaying messages and app status."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._message_timer = QTimer()
        self._message_timer.timeout.connect(self._clear_temporary_message)
        self._setup_ui()

    def _setup_ui(self):
        """Setup the status bar UI."""
        # Set a reasonable height for the status bar
        self.setFixedHeight(25)

        # Main message label (centered)
        self.message_label = QLabel()
        self.message_label.setStyleSheet("color: #ffa500; padding: 2px 5px;")
        self.message_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        font = QFont()
        font.setPointSize(9)
        self.message_label.setFont(font)

        # Add the message label as the main widget
        self.addWidget(self.message_label, 1)  # stretch factor 1

        # Permanent status label (right side)
        self.permanent_label = QLabel()
        self.permanent_label.setStyleSheet("color: #888; padding: 2px 5px;")
        font = QFont()
        font.setPointSize(9)
        self.permanent_label.setFont(font)
        self.addPermanentWidget(self.permanent_label)

        # Default state
        self.set_ready_message()

    def show_message(self, message: str, duration: int = 5000):
        """Show a temporary message for specified duration."""
        self.message_label.setText(message)
        self.message_label.setStyleSheet("color: #ffa500; padding: 2px 5px;")

        # Stop any existing timer
        self._message_timer.stop()

        # Start new timer if duration > 0
        if duration > 0:
            self._message_timer.start(duration)

    def show_error_message(self, message: str, duration: int = 8000):
        """Show an error message with red color."""
        self.message_label.setText(f"Error: {message}")
        self.message_label.setStyleSheet("color: #ff6b6b; padding: 2px 5px;")

        # Stop any existing timer
        self._message_timer.stop()

        # Start new timer if duration > 0
        if duration > 0:
            self._message_timer.start(duration)

    def show_success_message(self, message: str, duration: int = 3000):
        """Show a success message with green color."""
        self.message_label.setText(message)
        self.message_label.setStyleSheet("color: #51cf66; padding: 2px 5px;")

        # Stop any existing timer
        self._message_timer.stop()

        # Start new timer if duration > 0
        if duration > 0:
            self._message_timer.start(duration)

    def show_warning_message(self, message: str, duration: int = 5000):
        """Show a warning message with yellow color."""
        self.message_label.setText(f"Warning: {message}")
        self.message_label.setStyleSheet("color: #ffd43b; padding: 2px 5px;")

        # Stop any existing timer
        self._message_timer.stop()

        # Start new timer if duration > 0
        if duration > 0:
            self._message_timer.start(duration)

    def set_permanent_message(self, message: str):
        """Set a permanent message (usually for status info)."""
        self.permanent_label.setText(message)

    def set_ready_message(self):
        """Set the default ready message."""
        self.message_label.setText("")  # Blank instead of "Ready"
        self.message_label.setStyleSheet("color: #888; padding: 2px 5px;")
        self._message_timer.stop()

    def _clear_temporary_message(self):
        """Clear temporary message and return to ready state."""
        self.set_ready_message()
        self._message_timer.stop()

    def clear_message(self):
        """Immediately clear any message."""
        self.set_ready_message()
