"""Status bar widget for displaying active messages."""

from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QColor, QFont, QPainter
from PyQt6.QtWidgets import QHBoxLayout, QLabel, QStatusBar, QWidget


class ThemeToggle(QWidget):
    """A small slider toggle switch for dark/light mode."""

    toggled = pyqtSignal(bool)

    def __init__(self, parent=None, checked=True):
        super().__init__(parent)
        self._checked = checked
        self._animation_pos = 1.0 if checked else 0.0
        self._timer = QTimer(self)
        self._timer.setInterval(16)
        self._timer.timeout.connect(self._animate)
        self.setFixedSize(36, 20)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    @property
    def checked(self):
        return self._checked

    @checked.setter
    def checked(self, value):
        if self._checked != value:
            self._checked = value
            self._timer.start()

    def mousePressEvent(self, event):
        self._checked = not self._checked
        self._timer.start()
        self.toggled.emit(self._checked)

    def _animate(self):
        target = 1.0 if self._checked else 0.0
        diff = target - self._animation_pos
        if abs(diff) < 0.05:
            self._animation_pos = target
            self._timer.stop()
        else:
            self._animation_pos += diff * 0.3
        self.update()

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)

        w, h = self.width(), self.height()
        radius = h / 2

        # Track
        track_color = QColor("#555") if self._checked else QColor("#ccc")
        p.setBrush(track_color)
        p.setPen(Qt.PenStyle.NoPen)
        p.drawRoundedRect(0, 0, w, h, radius, radius)

        # Knob
        knob_r = h - 4
        knob_x = 2 + self._animation_pos * (w - knob_r - 4)
        knob_color = QColor("#1a1a2e") if self._checked else QColor("#ffd43b")
        p.setBrush(knob_color)
        p.drawEllipse(int(knob_x), 2, knob_r, knob_r)

        # Icon on knob
        p.setPen(QColor("#ffd43b") if self._checked else QColor("#666"))
        center_x = int(knob_x + knob_r / 2)
        center_y = int(2 + knob_r / 2)
        icon_font = QFont()
        icon_font.setPointSize(8)
        p.setFont(icon_font)
        symbol = "\u263e" if self._checked else "\u2600"
        p.drawText(center_x - 5, center_y + 4, symbol)

        p.end()


class StatusBar(QStatusBar):
    """Custom status bar for displaying messages and app status."""

    theme_toggled = pyqtSignal(bool)

    # Message colors per theme: (dark, light)
    _COLORS = {
        "message": ("#ffa500", "#c47600"),
        "error": ("#ff6b6b", "#c62828"),
        "success": ("#51cf66", "#2e7d32"),
        "warning": ("#ffd43b", "#b8860b"),
        "gpu": ("#51cf66", "#2e7d32"),
        "cpu": ("#888", "#666"),
        "no_ai": ("#ffa500", "#c47600"),
    }

    def __init__(self, parent=None, dark_mode=True):
        super().__init__(parent)
        self._message_timer = QTimer()
        self._message_timer.timeout.connect(self._clear_temporary_message)
        self._dark_mode = dark_mode
        self._setup_ui()

    def _setup_ui(self):
        """Setup the status bar UI."""
        # Set a reasonable height for the status bar
        self.setFixedHeight(25)

        # Theme toggle (far left)
        theme_container = QWidget()
        theme_layout = QHBoxLayout(theme_container)
        theme_layout.setContentsMargins(4, 0, 4, 0)
        theme_layout.setSpacing(4)
        self.theme_toggle = ThemeToggle(checked=self._dark_mode)
        self.theme_toggle.toggled.connect(self.theme_toggled.emit)
        theme_layout.addWidget(self.theme_toggle)
        self.addWidget(theme_container)

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
        self.permanent_label.setStyleSheet("padding: 2px 5px;")
        font = QFont()
        font.setPointSize(9)
        self.permanent_label.setFont(font)
        self.addPermanentWidget(self.permanent_label)

        # Device indicator (far right)
        self.device_label = QLabel()
        font = QFont()
        font.setPointSize(8)
        self.device_label.setFont(font)
        self.addPermanentWidget(self.device_label)
        self._update_device_indicator()

        # Default state
        self.set_ready_message()

    def _color(self, key: str) -> str:
        """Get theme-appropriate color for a message type."""
        dark, light = self._COLORS[key]
        return dark if self._dark_mode else light

    def update_theme(self, dark: bool) -> None:
        """Update colors when theme changes."""
        self._dark_mode = dark
        self._update_device_indicator()

    def show_message(self, message: str, duration: int = 5000):
        """Show a temporary message for specified duration."""
        self.message_label.setText(message)
        self.message_label.setStyleSheet(
            f"color: {self._color('message')}; padding: 2px 5px;"
        )

        # Stop any existing timer
        self._message_timer.stop()

        # Start new timer if duration > 0
        if duration > 0:
            self._message_timer.start(duration)

    def show_error_message(self, message: str, duration: int = 8000):
        """Show an error message with red color."""
        self.message_label.setText(f"Error: {message}")
        self.message_label.setStyleSheet(
            f"color: {self._color('error')}; padding: 2px 5px;"
        )

        # Stop any existing timer
        self._message_timer.stop()

        # Start new timer if duration > 0
        if duration > 0:
            self._message_timer.start(duration)

    def show_success_message(self, message: str, duration: int = 3000):
        """Show a success message with green color."""
        self.message_label.setText(message)
        self.message_label.setStyleSheet(
            f"color: {self._color('success')}; padding: 2px 5px;"
        )

        # Stop any existing timer
        self._message_timer.stop()

        # Start new timer if duration > 0
        if duration > 0:
            self._message_timer.start(duration)

    def show_warning_message(self, message: str, duration: int = 5000):
        """Show a warning message with yellow color."""
        self.message_label.setText(f"Warning: {message}")
        self.message_label.setStyleSheet(
            f"color: {self._color('warning')}; padding: 2px 5px;"
        )

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
        self.message_label.setStyleSheet("padding: 2px 5px;")
        self._message_timer.stop()

    def _clear_temporary_message(self):
        """Clear temporary message and return to ready state."""
        self.set_ready_message()
        self._message_timer.stop()

    def clear_message(self):
        """Immediately clear any message."""
        self.set_ready_message()

    def _update_device_indicator(self):
        """Detect GPU availability and update the device label."""
        try:
            import torch

            if torch.cuda.is_available():
                name = torch.cuda.get_device_name(0)
                self.device_label.setText(f"GPU: {name}")
                self.device_label.setStyleSheet(
                    f"color: {self._color('gpu')}; padding: 2px 8px; font-size: 8pt;"
                )
            else:
                self.device_label.setText("CPU Only")
                self.device_label.setStyleSheet(
                    f"color: {self._color('cpu')}; padding: 2px 8px; font-size: 8pt;"
                )
        except ImportError:
            self.device_label.setText("No AI")
            self.device_label.setStyleSheet(
                f"color: {self._color('no_ai')}; padding: 2px 8px; font-size: 8pt;"
            )
