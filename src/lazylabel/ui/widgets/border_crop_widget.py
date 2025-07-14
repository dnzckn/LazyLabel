"""Border crop widget for defining crop areas."""

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QVBoxLayout,
    QWidget,
)


class BorderCropWidget(QWidget):
    """Widget for border crop controls."""

    # Signals
    crop_draw_requested = pyqtSignal()
    crop_clear_requested = pyqtSignal()
    crop_applied = pyqtSignal(int, int, int, int)  # x1, y1, x2, y2

    def __init__(self, parent=None):
        super().__init__(parent)
        self._setup_ui()
        self._connect_signals()

    def _setup_ui(self):
        """Setup the UI layout."""
        group = QGroupBox("Border Crop")
        layout = QVBoxLayout(group)
        layout.setSpacing(8)

        # X coordinates input
        x_layout = QHBoxLayout()
        x_label = QLabel("X:")
        x_label.setFixedWidth(15)
        self.x_edit = QLineEdit()
        self.x_edit.setPlaceholderText("start:end (e.g., 20:460)")
        self.x_edit.setToolTip("X coordinate range in format start:end")
        x_layout.addWidget(x_label)
        x_layout.addWidget(self.x_edit)
        layout.addLayout(x_layout)

        # Y coordinates input
        y_layout = QHBoxLayout()
        y_label = QLabel("Y:")
        y_label.setFixedWidth(15)
        self.y_edit = QLineEdit()
        self.y_edit.setPlaceholderText("start:end (e.g., 20:460)")
        self.y_edit.setToolTip("Y coordinate range in format start:end")
        y_layout.addWidget(y_label)
        y_layout.addWidget(self.y_edit)
        layout.addLayout(y_layout)

        # Button row
        button_layout = QHBoxLayout()

        # Draw button with square icon
        self.btn_draw = QPushButton("⬚")
        self.btn_draw.setToolTip("Draw crop rectangle")
        self.btn_draw.setFixedWidth(30)
        self.btn_draw.setFixedHeight(28)
        self.btn_draw.setStyleSheet(self._get_button_style())

        # Clear button
        self.btn_clear = QPushButton("✕")
        self.btn_clear.setToolTip("Clear crop")
        self.btn_clear.setFixedWidth(30)
        self.btn_clear.setFixedHeight(28)
        self.btn_clear.setStyleSheet(self._get_button_style())

        # Apply button
        self.btn_apply = QPushButton("Apply")
        self.btn_apply.setToolTip("Apply crop from coordinates")
        self.btn_apply.setMinimumHeight(28)
        self.btn_apply.setStyleSheet(self._get_button_style())

        button_layout.addWidget(self.btn_draw)
        button_layout.addWidget(self.btn_clear)
        button_layout.addWidget(self.btn_apply)

        layout.addLayout(button_layout)

        # Status label
        self.status_label = QLabel("")
        self.status_label.setStyleSheet("color: #888; font-size: 10px;")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.status_label)

        # Main layout
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.addWidget(group)

    def _connect_signals(self):
        """Connect internal signals."""
        self.btn_draw.clicked.connect(self.crop_draw_requested)
        self.btn_clear.clicked.connect(self.crop_clear_requested)
        self.btn_apply.clicked.connect(self._apply_crop_from_text)
        self.x_edit.returnPressed.connect(self._apply_crop_from_text)
        self.y_edit.returnPressed.connect(self._apply_crop_from_text)

    def _apply_crop_from_text(self):
        """Apply crop from text input."""
        try:
            x_text = self.x_edit.text().strip()
            y_text = self.y_edit.text().strip()

            if not x_text or not y_text:
                self.set_status("Enter both X and Y coordinates")
                return

            # Parse X coordinates
            x_parts = x_text.split(":")
            if len(x_parts) != 2:
                self.set_status("Invalid X format. Use start:end")
                return
            x1, x2 = int(x_parts[0]), int(x_parts[1])

            # Parse Y coordinates
            y_parts = y_text.split(":")
            if len(y_parts) != 2:
                self.set_status("Invalid Y format. Use start:end")
                return
            y1, y2 = int(y_parts[0]), int(y_parts[1])

            # Ensure proper ordering
            if x1 > x2:
                x1, x2 = x2, x1
            if y1 > y2:
                y1, y2 = y2, y1

            # Emit signal with coordinates
            self.crop_applied.emit(x1, y1, x2, y2)
            self.set_status(f"Crop: {x1}:{x2}, {y1}:{y2}")

        except ValueError:
            self.set_status("Invalid coordinates. Use numbers only.")
        except Exception as e:
            self.set_status(f"Error: {str(e)}")

    def set_crop_coordinates(self, x1, y1, x2, y2):
        """Set crop coordinates in the text fields."""
        self.x_edit.setText(f"{x1}:{x2}")
        self.y_edit.setText(f"{y1}:{y2}")
        self.set_status(f"Crop: {x1}:{x2}, {y1}:{y2}")

    def clear_crop_coordinates(self):
        """Clear crop coordinates."""
        self.x_edit.clear()
        self.y_edit.clear()
        self.set_status("")

    def set_status(self, message):
        """Set status message."""
        self.status_label.setText(message)

    def get_crop_coordinates(self):
        """Get current crop coordinates if valid."""
        try:
            x_text = self.x_edit.text().strip()
            y_text = self.y_edit.text().strip()

            if not x_text or not y_text:
                return None

            x_parts = x_text.split(":")
            y_parts = y_text.split(":")

            if len(x_parts) != 2 or len(y_parts) != 2:
                return None

            x1, x2 = int(x_parts[0]), int(x_parts[1])
            y1, y2 = int(y_parts[0]), int(y_parts[1])

            # Ensure proper ordering
            if x1 > x2:
                x1, x2 = x2, x1
            if y1 > y2:
                y1, y2 = y2, y1

            return (x1, y1, x2, y2)
        except (ValueError, IndexError):
            return None

    def has_crop(self):
        """Check if crop coordinates are set."""
        return self.get_crop_coordinates() is not None

    def disable_thresholding_for_multi_view(self):
        """Disable thresholding controls for multi-view mode."""
        # This method is called when entering multi-view mode
        # to handle mixed BW/RGB images
        pass

    def enable_thresholding(self):
        """Re-enable thresholding controls when exiting multi-view mode."""
        # This method is called when exiting multi-view mode
        pass

    def _get_button_style(self):
        """Get consistent button styling."""
        return """
            QPushButton {
                background-color: rgba(70, 100, 130, 0.8);
                border: 1px solid rgba(90, 120, 150, 0.8);
                border-radius: 6px;
                color: #E0E0E0;
                font-weight: bold;
                font-size: 10px;
                padding: 4px 8px;
            }
            QPushButton:hover {
                background-color: rgba(90, 120, 150, 0.9);
                border-color: rgba(110, 140, 170, 0.9);
            }
            QPushButton:pressed {
                background-color: rgba(50, 80, 110, 0.9);
            }
        """
