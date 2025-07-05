"""
Channel Threshold Widget for LazyLabel.

This widget provides channel-based thresholding with multi-indicator sliders.
Users can add multiple threshold points by double-clicking on sliders,
creating pixel remapping with multiple value ranges.
"""

import numpy as np
from PyQt6.QtCore import QRect, Qt, pyqtSignal
from PyQt6.QtGui import QBrush, QColor, QFont, QPainter, QPen
from PyQt6.QtWidgets import (
    QCheckBox,
    QHBoxLayout,
    QLabel,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)


class MultiIndicatorSlider(QWidget):
    """Custom slider widget with multiple draggable indicators."""

    valueChanged = pyqtSignal(list)  # Emits list of indicator positions
    dragStarted = pyqtSignal()  # Emitted when user starts dragging
    dragFinished = pyqtSignal()  # Emitted when user finishes dragging

    def __init__(self, channel_name="Channel", minimum=0, maximum=256, parent=None):
        super().__init__(parent)
        self.channel_name = channel_name
        self.minimum = minimum
        self.maximum = maximum
        self.indicators = []  # Start with no indicators
        self.dragging_index = -1
        self.drag_offset = 0
        self.is_dragging = False  # Track if currently dragging

        self.setMinimumHeight(60)
        self.setFixedHeight(60)
        self.setMinimumWidth(200)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)

        # Colors for the channel
        self.channel_colors = {
            "Red": QColor(255, 100, 100),
            "Green": QColor(100, 255, 100),
            "Blue": QColor(100, 100, 255),
            "Gray": QColor(200, 200, 200),
            "Channel": QColor(150, 150, 150),
        }

    def get_channel_color(self):
        """Get color for this channel."""
        return self.channel_colors.get(self.channel_name, QColor(150, 150, 150))

    def get_slider_rect(self):
        """Get the slider track rectangle."""
        margin = 20
        return QRect(margin, 25, self.width() - 2 * margin, 10)

    def value_to_x(self, value):
        """Convert value to x coordinate."""
        slider_rect = self.get_slider_rect()
        ratio = (value - self.minimum) / (self.maximum - self.minimum)
        return slider_rect.left() + int(ratio * slider_rect.width())

    def x_to_value(self, x):
        """Convert x coordinate to value."""
        slider_rect = self.get_slider_rect()
        ratio = (x - slider_rect.left()) / slider_rect.width()
        ratio = max(0, min(1, ratio))  # Clamp to [0, 1]
        return int(self.minimum + ratio * (self.maximum - self.minimum))

    def paintEvent(self, event):
        """Paint the slider."""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        # Draw channel label
        font = QFont()
        font.setPointSize(9)
        painter.setFont(font)
        painter.setPen(QPen(QColor(255, 255, 255)))
        painter.drawText(5, 15, f"{self.channel_name}")

        # Draw slider track
        slider_rect = self.get_slider_rect()
        painter.setPen(QPen(QColor(100, 100, 100), 2))
        painter.setBrush(QBrush(QColor(50, 50, 50)))
        painter.drawRoundedRect(slider_rect, 5, 5)

        # Draw value segments
        channel_color = self.get_channel_color()
        sorted_indicators = sorted(self.indicators)

        # Handle case with no indicators - draw single segment
        if not sorted_indicators:
            # Single segment covering entire slider
            segment_rect = QRect(
                slider_rect.left(),
                slider_rect.top(),
                slider_rect.width(),
                slider_rect.height(),
            )
            # Use low alpha for inactive state
            segment_color = QColor(channel_color)
            segment_color.setAlpha(50)
            painter.setBrush(QBrush(segment_color))
            painter.setPen(QPen(Qt.GlobalColor.transparent))
            painter.drawRoundedRect(segment_rect, 5, 5)
        else:
            # Draw segments between indicators
            for i in range(len(sorted_indicators) + 1):
                start_val = self.minimum if i == 0 else sorted_indicators[i - 1]
                end_val = (
                    self.maximum
                    if i == len(sorted_indicators)
                    else sorted_indicators[i]
                )

                start_x = self.value_to_x(start_val)
                end_x = self.value_to_x(end_val)

                # Calculate segment value (evenly distributed)
                segment_value = (
                    i / len(sorted_indicators) if len(sorted_indicators) > 0 else 0
                )
                alpha = int(50 + segment_value * 150)  # 50-200 alpha range

                segment_color = QColor(channel_color)
                segment_color.setAlpha(alpha)

                segment_rect = QRect(
                    start_x, slider_rect.top(), end_x - start_x, slider_rect.height()
                )
                painter.setBrush(QBrush(segment_color))
                painter.setPen(QPen(Qt.GlobalColor.transparent))
                painter.drawRoundedRect(segment_rect, 5, 5)

        # Draw indicators
        for i, value in enumerate(self.indicators):
            x = self.value_to_x(value)

            # Indicator handle
            handle_rect = QRect(
                x - 6, slider_rect.top() - 3, 12, slider_rect.height() + 6
            )

            # Highlight if dragging
            if i == self.dragging_index:
                painter.setBrush(QBrush(QColor(255, 255, 100)))
                painter.setPen(QPen(QColor(200, 200, 50), 2))
            else:
                painter.setBrush(QBrush(QColor(255, 255, 255)))
                painter.setPen(QPen(QColor(150, 150, 150), 1))

            painter.drawRoundedRect(handle_rect, 3, 3)

            # Value label
            painter.setPen(QPen(QColor(255, 255, 255)))
            painter.drawText(x - 15, slider_rect.bottom() + 15, f"{value}")

    def mousePressEvent(self, event):
        """Handle mouse press events."""
        if event.button() == Qt.MouseButton.LeftButton:
            slider_rect = self.get_slider_rect()

            # Check if clicking on an existing indicator
            for i, value in enumerate(self.indicators):
                x = self.value_to_x(value)
                handle_rect = QRect(
                    x - 6, slider_rect.top() - 3, 12, slider_rect.height() + 6
                )

                if handle_rect.contains(event.pos()):
                    self.dragging_index = i
                    self.drag_offset = event.pos().x() - x
                    self.setCursor(Qt.CursorShape.ClosedHandCursor)
                    self.is_dragging = True
                    self.dragStarted.emit()
                    return

    def mouseDoubleClickEvent(self, event):
        """Handle double-click to add new indicator."""
        if event.button() == Qt.MouseButton.LeftButton:
            slider_rect = self.get_slider_rect()

            if slider_rect.contains(event.pos()):
                new_value = self.x_to_value(event.pos().x())

                # Don't add if too close to existing indicator
                min_distance = 10
                for existing_value in self.indicators:
                    if abs(new_value - existing_value) < min_distance:
                        return

                self.indicators.append(new_value)
                self.indicators.sort()
                self.valueChanged.emit(self.indicators[:])
                self.update()

    def mouseMoveEvent(self, event):
        """Handle mouse move events for dragging."""
        if self.dragging_index >= 0:
            new_x = event.pos().x() - self.drag_offset
            new_value = self.x_to_value(new_x)

            # Clamp value
            new_value = max(self.minimum, min(self.maximum, new_value))

            # Update indicator
            self.indicators[self.dragging_index] = new_value
            self.valueChanged.emit(self.indicators[:])
            self.update()

    def mouseReleaseEvent(self, event):
        """Handle mouse release events."""
        if event.button() == Qt.MouseButton.LeftButton:
            self.dragging_index = -1
            self.setCursor(Qt.CursorShape.ArrowCursor)
            self.is_dragging = False
            self.dragFinished.emit()

    def contextMenuEvent(self, event):
        """Handle right-click to remove indicator."""
        slider_rect = self.get_slider_rect()

        # Only allow removal if more than 1 indicator
        if len(self.indicators) <= 1:
            return

        # Check if right-clicking on an indicator
        for i, value in enumerate(self.indicators):
            x = self.value_to_x(value)
            handle_rect = QRect(
                x - 6, slider_rect.top() - 3, 12, slider_rect.height() + 6
            )

            if handle_rect.contains(event.pos()):
                self.indicators.pop(i)
                self.valueChanged.emit(self.indicators[:])
                self.update()
                return

    def reset(self):
        """Reset to no indicators."""
        self.indicators = []
        self.valueChanged.emit(self.indicators[:])
        self.update()

    def get_indicators(self):
        """Get current indicator values."""
        return self.indicators[:]

    def set_indicators(self, indicators):
        """Set indicator values."""
        self.indicators = indicators[:]
        self.valueChanged.emit(self.indicators[:])
        self.update()


class ChannelSliderWidget(QWidget):
    """Combined widget with checkbox and slider for a single channel."""

    valueChanged = pyqtSignal()  # Emitted when checkbox or slider changes
    dragStarted = pyqtSignal()  # Emitted when slider drag starts
    dragFinished = pyqtSignal()  # Emitted when slider drag finishes

    def __init__(self, channel_name, parent=None):
        super().__init__(parent)
        self.channel_name = channel_name
        self.setupUI()

    def setupUI(self):
        """Set up the UI for the combined widget."""
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(5)

        # Checkbox to enable/disable
        self.checkbox = QCheckBox()
        self.checkbox.setChecked(False)
        self.checkbox.toggled.connect(self._on_checkbox_toggled)
        layout.addWidget(self.checkbox)

        # Slider
        self.slider = MultiIndicatorSlider(self.channel_name, 0, 256, self)
        self.slider.valueChanged.connect(self._on_slider_changed)
        self.slider.dragStarted.connect(self.dragStarted.emit)  # Forward drag signals
        self.slider.dragFinished.connect(self.dragFinished.emit)
        self.slider.setEnabled(False)  # Start disabled
        layout.addWidget(self.slider)

    def _on_checkbox_toggled(self, checked):
        """Handle checkbox toggle."""
        self.slider.setEnabled(checked)
        if not checked:
            # Reset slider when unchecked
            self.slider.reset()
        self.valueChanged.emit()

    def _on_slider_changed(self):
        """Handle slider value change."""
        if self.checkbox.isChecked():
            self.valueChanged.emit()

    def is_enabled(self):
        """Check if this channel is enabled."""
        return self.checkbox.isChecked()

    def get_indicators(self):
        """Get current indicator values if enabled."""
        if self.is_enabled():
            return self.slider.get_indicators()
        return []

    def reset(self):
        """Reset this channel."""
        self.checkbox.setChecked(False)
        self.slider.reset()


class ChannelThresholdWidget(QWidget):
    """Widget for channel-based thresholding with multi-indicator sliders."""

    thresholdChanged = pyqtSignal()  # Emitted when any threshold changes
    dragStarted = pyqtSignal()  # Emitted when any slider drag starts
    dragFinished = pyqtSignal()  # Emitted when any slider drag finishes

    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_image_channels = 0  # 0 = no image, 1 = grayscale, 3 = RGB
        self.sliders = {}  # Dictionary of channel name -> slider

        self.setupUI()

    def setupUI(self):
        """Set up the user interface."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        layout.setSpacing(5)

        # Title
        title_label = QLabel("Channel Thresholding")
        title_label.setStyleSheet("font-weight: bold; font-size: 11px;")
        layout.addWidget(title_label)

        # Sliders container
        self.sliders_layout = QVBoxLayout()
        layout.addLayout(self.sliders_layout)

        # Instructions
        instructions = QLabel(
            "✓ Check to enable • Double-click to add threshold • Right-click to remove"
        )
        instructions.setStyleSheet("color: #888; font-size: 9px;")
        instructions.setWordWrap(True)
        layout.addWidget(instructions)

        layout.addStretch()

    def update_for_image(self, image_array):
        """Update widget based on loaded image."""
        if image_array is None:
            self._clear_sliders()
            self.current_image_channels = 0
            return

        # Determine number of channels
        if len(image_array.shape) == 2:
            # Grayscale
            self.current_image_channels = 1
            channels = ["Gray"]
        elif len(image_array.shape) == 3 and image_array.shape[2] == 3:
            # RGB
            self.current_image_channels = 3
            channels = ["Red", "Green", "Blue"]
        else:
            # Unsupported format
            self._clear_sliders()
            self.current_image_channels = 0
            return

        # Create sliders for each channel
        self._create_sliders(channels)

    def _create_sliders(self, channel_names):
        """Create sliders for the specified channels."""
        # Clear existing sliders
        self._clear_sliders()

        # Create new combined slider widgets
        for channel_name in channel_names:
            slider_widget = ChannelSliderWidget(channel_name, self)
            slider_widget.valueChanged.connect(self._on_slider_changed)
            slider_widget.dragStarted.connect(
                self.dragStarted.emit
            )  # Forward drag signals
            slider_widget.dragFinished.connect(self.dragFinished.emit)
            self.sliders[channel_name] = slider_widget
            self.sliders_layout.addWidget(slider_widget)

    def _clear_sliders(self):
        """Clear all sliders."""
        for slider in self.sliders.values():
            self.sliders_layout.removeWidget(slider)
            slider.deleteLater()
        self.sliders.clear()

    def _on_slider_changed(self):
        """Handle slider value change."""
        self.thresholdChanged.emit()

    def get_threshold_settings(self):
        """Get current threshold settings for all channels."""
        settings = {}
        for channel_name, slider_widget in self.sliders.items():
            settings[channel_name] = slider_widget.get_indicators()
        return settings

    def apply_thresholding(self, image_array):
        """Apply thresholding to image array and return modified array."""
        if image_array is None or not self.sliders:
            return image_array

        # Create a copy to modify
        result = image_array.copy().astype(np.float32)

        if self.current_image_channels == 1:
            # Grayscale image
            if "Gray" in self.sliders:
                result = self._apply_channel_thresholding(
                    result, self.sliders["Gray"].get_indicators()
                )
        elif self.current_image_channels == 3:
            # RGB image
            channel_names = ["Red", "Green", "Blue"]
            for i, channel_name in enumerate(channel_names):
                if channel_name in self.sliders:
                    result[:, :, i] = self._apply_channel_thresholding(
                        result[:, :, i], self.sliders[channel_name].get_indicators()
                    )

        # Convert back to uint8
        return np.clip(result, 0, 255).astype(np.uint8)

    def _apply_channel_thresholding(self, channel_data, indicators):
        """Apply thresholding to a single channel."""
        if not indicators:
            return channel_data

            # Sort indicators
        sorted_indicators = sorted(indicators)

        # Create output array
        result = np.zeros_like(channel_data)

        # Number of segments = number of indicators + 1
        num_segments = len(sorted_indicators) + 1

        # Apply thresholding for each segment
        for i in range(num_segments):
            # Determine segment bounds
            if i == 0:
                # First segment: 0 to first indicator
                mask = channel_data < sorted_indicators[0]
                segment_value = 0
            elif i == num_segments - 1:
                # Last segment: last indicator to max
                mask = channel_data >= sorted_indicators[-1]
                segment_value = 255
            else:
                # Middle segments
                mask = (channel_data >= sorted_indicators[i - 1]) & (
                    channel_data < sorted_indicators[i]
                )
                # Evenly distribute values between segments
                segment_value = int((i / (num_segments - 1)) * 255)

            result[mask] = segment_value

        return result

    def has_active_thresholding(self):
        """Check if any channel has active thresholding (indicators present)."""
        for slider_widget in self.sliders.values():
            if slider_widget.get_indicators():
                return True
        return False

    def get_threshold_params(self):
        """Get current threshold parameters for caching."""
        params = {}
        for channel_name, slider_widget in self.sliders.items():
            params[channel_name] = {
                "indicators": sorted(slider_widget.get_indicators()),
                "enabled": slider_widget.is_enabled(),
            }
        return params
