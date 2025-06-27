"""Left control panel with mode controls and settings."""

from PyQt6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QPushButton,
    QLabel,
    QFrame,
    QHBoxLayout,
    QCheckBox,
    QSlider,
    QGroupBox,
    QComboBox,
)
from PyQt6.QtCore import Qt, pyqtSignal

from .widgets import ModelSelectionWidget, SettingsWidget, AdjustmentsWidget


class ControlPanel(QWidget):
    """Left control panel with mode controls and settings."""

    # Signals
    sam_mode_requested = pyqtSignal()
    polygon_mode_requested = pyqtSignal()
    selection_mode_requested = pyqtSignal()
    clear_points_requested = pyqtSignal()
    fit_view_requested = pyqtSignal()
    browse_models_requested = pyqtSignal()
    refresh_models_requested = pyqtSignal()
    model_selected = pyqtSignal(str)
    annotation_size_changed = pyqtSignal(int)
    pan_speed_changed = pyqtSignal(int)
    join_threshold_changed = pyqtSignal(int)
    hotkeys_requested = pyqtSignal()
    pop_out_requested = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumWidth(50)  # Allow collapsing but maintain minimum
        self.preferred_width = 250  # Store preferred width for expansion
        self._setup_ui()
        self._connect_signals()

    def _setup_ui(self):
        """Setup the UI layout."""
        layout = QVBoxLayout(self)
        layout.setAlignment(Qt.AlignmentFlag.AlignTop)

        # Top button row
        toggle_layout = QHBoxLayout()
        toggle_layout.addStretch()

        self.btn_popout = QPushButton("⋯")
        self.btn_popout.setToolTip("Pop out panel to separate window")
        self.btn_popout.setMaximumWidth(30)
        toggle_layout.addWidget(self.btn_popout)

        layout.addLayout(toggle_layout)

        # Main controls widget
        self.main_controls_widget = QWidget()
        main_layout = QVBoxLayout(self.main_controls_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)

        # Mode label
        self.mode_label = QLabel("Mode: Points")
        font = self.mode_label.font()
        font.setPointSize(14)
        font.setBold(True)
        self.mode_label.setFont(font)
        main_layout.addWidget(self.mode_label)

        # Mode buttons
        self._add_mode_buttons(main_layout)

        # Separator
        main_layout.addSpacing(20)
        main_layout.addWidget(self._create_separator())
        main_layout.addSpacing(10)

        # Model selection
        self.model_widget = ModelSelectionWidget()
        main_layout.addWidget(self.model_widget)

        # Separator
        main_layout.addSpacing(10)
        main_layout.addWidget(self._create_separator())
        main_layout.addSpacing(10)

        # Action buttons
        self._add_action_buttons(main_layout)
        main_layout.addSpacing(10)

        # Settings
        self.settings_widget = SettingsWidget()
        main_layout.addWidget(self.settings_widget)

        # Adjustments
        self.adjustments_widget = AdjustmentsWidget()
        main_layout.addWidget(self.adjustments_widget)

        main_layout.addStretch()

        # Status labels
        self.notification_label = QLabel("")
        font = self.notification_label.font()
        font.setItalic(True)
        self.notification_label.setFont(font)
        self.notification_label.setStyleSheet("color: #ffa500;")
        self.notification_label.setWordWrap(True)
        main_layout.addWidget(self.notification_label)

        layout.addWidget(self.main_controls_widget)

    def _add_mode_buttons(self, layout):
        """Add mode control buttons."""
        self.btn_sam_mode = QPushButton("Point Mode (1)")
        self.btn_sam_mode.setToolTip("Switch to Point Mode for AI segmentation (1)")

        self.btn_polygon_mode = QPushButton("Polygon Mode (2)")
        self.btn_polygon_mode.setToolTip("Switch to Polygon Drawing Mode (2)")

        self.btn_selection_mode = QPushButton("Selection Mode (E)")
        self.btn_selection_mode.setToolTip("Toggle segment selection (E)")

        layout.addWidget(self.btn_sam_mode)
        layout.addWidget(self.btn_polygon_mode)
        layout.addWidget(self.btn_selection_mode)

    def _add_action_buttons(self, layout):
        """Add action buttons."""
        self.btn_fit_view = QPushButton("Fit View (.)")
        self.btn_fit_view.setToolTip("Reset image zoom and pan to fit the view (.)")

        self.btn_clear_points = QPushButton("Clear Clicks (C)")
        self.btn_clear_points.setToolTip("Clear current temporary points/vertices (C)")

        self.btn_hotkeys = QPushButton("Hotkeys")
        self.btn_hotkeys.setToolTip("Configure keyboard shortcuts")

        layout.addWidget(self.btn_fit_view)
        layout.addWidget(self.btn_clear_points)
        layout.addWidget(self.btn_hotkeys)

    def _create_separator(self):
        """Create a horizontal separator line."""
        line = QFrame()
        line.setFrameShape(QFrame.Shape.HLine)
        return line

    def _connect_signals(self):
        """Connect internal signals."""
        self.btn_sam_mode.clicked.connect(self.sam_mode_requested)
        self.btn_polygon_mode.clicked.connect(self.polygon_mode_requested)
        self.btn_selection_mode.clicked.connect(self.selection_mode_requested)
        self.btn_clear_points.clicked.connect(self.clear_points_requested)
        self.btn_fit_view.clicked.connect(self.fit_view_requested)
        self.btn_hotkeys.clicked.connect(self.hotkeys_requested)
        self.btn_popout.clicked.connect(self.pop_out_requested)

        # Model widget signals
        self.model_widget.browse_requested.connect(self.browse_models_requested)
        self.model_widget.refresh_requested.connect(self.refresh_models_requested)
        self.model_widget.model_selected.connect(self.model_selected)

        # Adjustments widget signals
        self.adjustments_widget.annotation_size_changed.connect(
            self.annotation_size_changed
        )
        self.adjustments_widget.pan_speed_changed.connect(self.pan_speed_changed)
        self.adjustments_widget.join_threshold_changed.connect(
            self.join_threshold_changed
        )

    def mouseDoubleClickEvent(self, event):
        """Handle double-click to expand collapsed panel."""
        if self.width() < 50:  # If panel is collapsed
            # Request expansion by calling parent method
            if self.parent() and hasattr(self.parent(), "_expand_left_panel"):
                self.parent()._expand_left_panel()
        super().mouseDoubleClickEvent(event)

    def show_notification(self, message: str, duration: int = 3000):
        """Show a notification message."""
        self.notification_label.setText(message)
        # Note: Timer should be handled by the caller

    def clear_notification(self):
        """Clear the notification message."""
        self.notification_label.clear()

    def set_mode_text(self, mode: str):
        """Set the mode label text."""
        self.mode_label.setText(f"Mode: {mode.replace('_', ' ').title()}")

    # Delegate methods for sub-widgets
    def populate_models(self, models):
        """Populate the models combo box."""
        self.model_widget.populate_models(models)

    def set_current_model(self, model_name):
        """Set the current model display."""
        self.model_widget.set_current_model(model_name)

    def get_settings(self):
        """Get current settings from the settings widget."""
        return self.settings_widget.get_settings()

    def set_settings(self, settings):
        """Set settings in the settings widget."""
        self.settings_widget.set_settings(settings)

    def get_annotation_size(self):
        """Get current annotation size."""
        return self.adjustments_widget.get_annotation_size()

    def set_annotation_size(self, value):
        """Set annotation size."""
        self.adjustments_widget.set_annotation_size(value)

    def set_join_threshold(self, value):
        """Set join threshold."""
        self.adjustments_widget.set_join_threshold(value)

    def set_sam_mode_enabled(self, enabled: bool):
        """Enable or disable the SAM mode button."""
        self.btn_sam_mode.setEnabled(enabled)
        if not enabled:
            self.btn_sam_mode.setToolTip("Point Mode (SAM model not available)")
        else:
            self.btn_sam_mode.setToolTip("Switch to Point Mode for AI segmentation (1)")

    def set_popout_mode(self, is_popped_out: bool):
        """Update the pop-out button based on panel state."""
        if is_popped_out:
            self.btn_popout.setText("⇤")
            self.btn_popout.setToolTip("Return panel to main window")
        else:
            self.btn_popout.setText("⋯")
            self.btn_popout.setToolTip("Pop out panel to separate window")
