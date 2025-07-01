"""Left control panel with mode controls and settings."""

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from .widgets import (
    AdjustmentsWidget,
    BorderCropWidget,
    ChannelThresholdWidget,
    FragmentThresholdWidget,
    ModelSelectionWidget,
    SettingsWidget,
)


class SimpleCollapsible(QWidget):
    """A simple collapsible widget for use within tabs."""

    def __init__(self, title: str, content_widget: QWidget, parent=None):
        super().__init__(parent)
        self.content_widget = content_widget
        self.is_collapsed = False

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(2)

        # Header with toggle button
        header_layout = QHBoxLayout()
        header_layout.setContentsMargins(2, 2, 2, 2)

        self.toggle_button = QPushButton("▼")
        self.toggle_button.setMaximumWidth(16)
        self.toggle_button.setMaximumHeight(16)
        self.toggle_button.setStyleSheet(
            """
            QPushButton {
                border: 1px solid rgba(120, 120, 120, 0.5);
                background: rgba(70, 70, 70, 0.6);
                color: #E0E0E0;
                font-size: 10px;
                font-weight: bold;
                border-radius: 2px;
            }
            QPushButton:hover {
                background: rgba(90, 90, 90, 0.8);
                border: 1px solid rgba(140, 140, 140, 0.8);
                color: #FFF;
            }
            QPushButton:pressed {
                background: rgba(50, 50, 50, 0.8);
                border: 1px solid rgba(100, 100, 100, 0.6);
            }
        """
        )
        self.toggle_button.clicked.connect(self.toggle_collapse)

        title_label = QLabel(title)
        title_label.setStyleSheet(
            """
            QLabel {
                color: #E0E0E0;
                font-weight: bold;
                font-size: 11px;
                background: transparent;
                border: none;
                padding: 2px;
            }
        """
        )

        header_layout.addWidget(self.toggle_button)
        header_layout.addWidget(title_label)
        header_layout.addStretch()

        self.header_widget = QWidget()
        self.header_widget.setLayout(header_layout)
        self.header_widget.setStyleSheet(
            """
            QWidget {
                background-color: rgba(60, 60, 60, 0.3);
                border-radius: 3px;
                border: 1px solid rgba(80, 80, 80, 0.4);
            }
        """
        )
        self.header_widget.setFixedHeight(20)

        layout.addWidget(self.header_widget)
        layout.addWidget(content_widget)

        # Add some spacing below content
        layout.addSpacing(4)

    def toggle_collapse(self):
        """Toggle the collapsed state."""
        self.is_collapsed = not self.is_collapsed
        self.content_widget.setVisible(not self.is_collapsed)
        self.toggle_button.setText("▶" if self.is_collapsed else "▼")


class ProfessionalCard(QFrame):
    """A professional-looking card widget for containing controls."""

    def __init__(self, title: str = "", parent=None):
        super().__init__(parent)
        self.setFrameStyle(QFrame.Shape.Box)
        self.setStyleSheet(
            """
            QFrame {
                background-color: rgba(40, 40, 40, 0.8);
                border: 1px solid rgba(80, 80, 80, 0.6);
                border-radius: 8px;
                margin: 2px;
            }
        """
        )

        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(6)

        if title:
            title_label = QLabel(title)
            title_label.setStyleSheet(
                """
                QLabel {
                    color: #E0E0E0;
                    font-weight: bold;
                    font-size: 11px;
                    border: none;
                    background: transparent;
                    padding: 0px;
                    margin-bottom: 4px;
                }
            """
            )
            layout.addWidget(title_label)

        self.content_layout = layout

    def addWidget(self, widget):
        """Add a widget to the card."""
        self.content_layout.addWidget(widget)

    def addLayout(self, layout):
        """Add a layout to the card."""
        self.content_layout.addLayout(layout)


class ControlPanel(QWidget):
    """Left control panel with mode controls and settings."""

    # Signals
    sam_mode_requested = pyqtSignal()
    polygon_mode_requested = pyqtSignal()
    bbox_mode_requested = pyqtSignal()
    selection_mode_requested = pyqtSignal()
    edit_mode_requested = pyqtSignal()
    clear_points_requested = pyqtSignal()
    fit_view_requested = pyqtSignal()
    browse_models_requested = pyqtSignal()
    refresh_models_requested = pyqtSignal()
    model_selected = pyqtSignal(str)
    annotation_size_changed = pyqtSignal(int)
    pan_speed_changed = pyqtSignal(int)
    join_threshold_changed = pyqtSignal(int)
    fragment_threshold_changed = pyqtSignal(int)
    brightness_changed = pyqtSignal(int)
    contrast_changed = pyqtSignal(int)
    gamma_changed = pyqtSignal(int)
    reset_adjustments_requested = pyqtSignal()
    image_adjustment_changed = pyqtSignal()
    hotkeys_requested = pyqtSignal()
    pop_out_requested = pyqtSignal()
    settings_changed = pyqtSignal()
    # Border crop signals
    crop_draw_requested = pyqtSignal()
    crop_clear_requested = pyqtSignal()
    crop_applied = pyqtSignal(int, int, int, int)  # x1, y1, x2, y2
    # Channel threshold signals
    channel_threshold_changed = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumWidth(260)  # Slightly wider for better layout
        self.preferred_width = 280
        self._setup_ui()
        self._connect_signals()

    def _setup_ui(self):
        """Setup the professional UI layout."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(8)

        # Create widgets first
        self.model_widget = ModelSelectionWidget()
        self.crop_widget = BorderCropWidget()
        self.channel_threshold_widget = ChannelThresholdWidget()
        self.settings_widget = SettingsWidget()
        self.adjustments_widget = AdjustmentsWidget()
        self.fragment_widget = FragmentThresholdWidget()

        # Top header with pop-out button
        header_layout = QHBoxLayout()
        header_layout.addStretch()

        self.btn_popout = QPushButton("⋯")
        self.btn_popout.setToolTip("Pop out panel to separate window")
        self.btn_popout.setMaximumWidth(30)
        self.btn_popout.setMaximumHeight(25)
        self.btn_popout.setStyleSheet(
            """
            QPushButton {
                background-color: rgba(60, 60, 60, 0.8);
                border: 1px solid rgba(80, 80, 80, 0.6);
                border-radius: 4px;
                color: #E0E0E0;
            }
            QPushButton:hover {
                background-color: rgba(80, 80, 80, 0.9);
            }
            QPushButton:pressed {
                background-color: rgba(40, 40, 40, 0.9);
            }
        """
        )
        header_layout.addWidget(self.btn_popout)
        layout.addLayout(header_layout)

        # Fixed Mode Controls Section (Always Visible)
        mode_card = self._create_mode_card()
        layout.addWidget(mode_card)

        # Tabbed Interface for Everything Else
        self.tab_widget = QTabWidget()
        self.tab_widget.setStyleSheet(
            """
            QTabWidget::pane {
                border: 1px solid rgba(80, 80, 80, 0.6);
                border-radius: 6px;
                background-color: rgba(35, 35, 35, 0.9);
                margin-top: 2px;
            }
            QTabWidget::tab-bar {
                alignment: center;
            }
            QTabBar::tab {
                background-color: rgba(50, 50, 50, 0.8);
                border: 1px solid rgba(70, 70, 70, 0.6);
                border-bottom: none;
                border-radius: 4px 4px 0 0;
                padding: 4px 8px;
                margin-right: 1px;
                color: #B0B0B0;
                font-size: 9px;
                min-width: 45px;
                max-width: 80px;
            }
            QTabBar::tab:selected {
                background-color: rgba(70, 70, 70, 0.9);
                color: #E0E0E0;
                font-weight: bold;
            }
            QTabBar::tab:hover:!selected {
                background-color: rgba(60, 60, 60, 0.8);
                color: #D0D0D0;
            }
        """
        )

        # AI & Settings Tab
        ai_tab = self._create_ai_tab()
        self.tab_widget.addTab(ai_tab, "🤖 AI")

        # Processing & Adjustments Tab
        processing_tab = self._create_processing_tab()
        self.tab_widget.addTab(processing_tab, "🛠️ Tools")

        layout.addWidget(self.tab_widget, 1)

        # Status label at bottom
        self.notification_label = QLabel("")
        self.notification_label.setStyleSheet(
            """
            QLabel {
                color: #FFA500;
                font-style: italic;
                font-size: 9px;
                background: transparent;
                border: none;
                padding: 4px;
            }
        """
        )
        self.notification_label.setWordWrap(True)
        layout.addWidget(self.notification_label)

    def _create_mode_card(self):
        """Create the fixed mode controls card."""
        mode_card = ProfessionalCard("Mode Controls")

        # Mode buttons in a clean grid
        buttons_layout = QVBoxLayout()
        buttons_layout.setSpacing(4)

        # First row: AI and Polygon
        row1_layout = QHBoxLayout()
        row1_layout.setSpacing(4)

        self.btn_sam_mode = self._create_mode_button(
            "AI", "1", "Switch to AI Mode for AI segmentation"
        )
        self.btn_sam_mode.setCheckable(True)
        self.btn_sam_mode.setChecked(True)  # Default mode

        self.btn_polygon_mode = self._create_mode_button(
            "Poly", "2", "Switch to Polygon Drawing Mode"
        )
        self.btn_polygon_mode.setCheckable(True)

        row1_layout.addWidget(self.btn_sam_mode)
        row1_layout.addWidget(self.btn_polygon_mode)
        buttons_layout.addLayout(row1_layout)

        # Second row: BBox and Selection
        row2_layout = QHBoxLayout()
        row2_layout.setSpacing(4)

        self.btn_bbox_mode = self._create_mode_button(
            "Box", "3", "Switch to Bounding Box Drawing Mode"
        )
        self.btn_bbox_mode.setCheckable(True)

        self.btn_selection_mode = self._create_mode_button(
            "Select", "E", "Toggle segment selection"
        )
        self.btn_selection_mode.setCheckable(True)

        row2_layout.addWidget(self.btn_bbox_mode)
        row2_layout.addWidget(self.btn_selection_mode)
        buttons_layout.addLayout(row2_layout)

        mode_card.addLayout(buttons_layout)

        # Bottom utility row: Edit and Hotkeys
        utility_layout = QHBoxLayout()
        utility_layout.setSpacing(4)

        self.btn_edit_mode = self._create_utility_button(
            "Edit", "R", "Edit segments and polygons"
        )
        self.btn_edit_mode.setCheckable(True)  # Make edit button checkable

        self.btn_hotkeys = self._create_utility_button(
            "⌨️ Hotkeys", "", "Configure keyboard shortcuts"
        )

        utility_layout.addWidget(self.btn_edit_mode)
        utility_layout.addWidget(self.btn_hotkeys)

        mode_card.addLayout(utility_layout)

        return mode_card

    def _create_mode_button(self, text, key, tooltip):
        """Create a professional mode button."""
        button = QPushButton(f"{text} ({key})")
        button.setToolTip(f"{tooltip} ({key})")
        button.setFixedHeight(28)
        button.setFixedWidth(75)  # Fixed width for consistency
        button.setStyleSheet(
            """
            QPushButton {
                background-color: rgba(60, 90, 120, 0.8);
                border: 1px solid rgba(80, 110, 140, 0.8);
                border-radius: 6px;
                color: #E0E0E0;
                font-weight: bold;
                font-size: 10px;
                padding: 4px 8px;
            }
            QPushButton:hover {
                background-color: rgba(80, 110, 140, 0.9);
                border-color: rgba(100, 130, 160, 0.9);
            }
            QPushButton:pressed {
                background-color: rgba(40, 70, 100, 0.9);
            }
            QPushButton:checked {
                background-color: rgba(120, 170, 220, 1.0);
                border: 2px solid rgba(150, 200, 250, 1.0);
                color: #FFFFFF;
                font-weight: bold;
            }
            QPushButton:checked:hover {
                background-color: rgba(140, 190, 240, 1.0);
                border: 2px solid rgba(170, 220, 255, 1.0);
            }
        """
        )
        return button

    def _create_utility_button(self, text, key, tooltip):
        """Create a utility button with consistent styling."""
        if key:
            button_text = f"{text} ({key})"
            tooltip_text = f"{tooltip} ({key})"
        else:
            button_text = text
            tooltip_text = tooltip

        button = QPushButton(button_text)
        button.setToolTip(tooltip_text)
        button.setFixedHeight(28)
        button.setFixedWidth(75)  # Fixed width for consistency
        button.setStyleSheet(
            """
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
            QPushButton:checked {
                background-color: rgba(120, 170, 220, 1.0);
                border: 2px solid rgba(150, 200, 250, 1.0);
                color: #FFFFFF;
                font-weight: bold;
            }
            QPushButton:checked:hover {
                background-color: rgba(140, 190, 240, 1.0);
                border: 2px solid rgba(170, 220, 255, 1.0);
            }
        """
        )
        return button

    def _get_mode_sized_button_style(self):
        """Get styling for utility buttons that matches mode button size."""
        return """
            QPushButton {
                background-color: rgba(80, 80, 80, 0.8);
                border: 1px solid rgba(100, 100, 100, 0.6);
                border-radius: 6px;
                color: #E0E0E0;
                font-weight: bold;
                font-size: 10px;
                padding: 4px 8px;
                min-height: 22px;
            }
            QPushButton:hover {
                background-color: rgba(100, 100, 100, 0.9);
                border-color: rgba(120, 120, 120, 0.8);
            }
            QPushButton:pressed {
                background-color: rgba(60, 60, 60, 0.9);
            }
        """

    def _get_utility_button_style(self):
        """Get styling for utility buttons."""
        return """
            QPushButton {
                background-color: rgba(80, 80, 80, 0.8);
                border: 1px solid rgba(100, 100, 100, 0.6);
                border-radius: 5px;
                color: #E0E0E0;
                font-size: 10px;
                padding: 4px 8px;
                min-height: 22px;
            }
            QPushButton:hover {
                background-color: rgba(100, 100, 100, 0.9);
            }
            QPushButton:pressed {
                background-color: rgba(60, 60, 60, 0.9);
            }
        """

    def _create_ai_tab(self):
        """Create the AI & Settings tab."""
        tab_widget = QWidget()

        # Create scroll area for AI and settings
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        scroll.setStyleSheet(
            """
            QScrollArea {
                border: none;
                background: transparent;
            }
            QScrollBar:vertical {
                background-color: rgba(60, 60, 60, 0.5);
                width: 8px;
                border-radius: 4px;
            }
            QScrollBar::handle:vertical {
                background-color: rgba(120, 120, 120, 0.7);
                border-radius: 4px;
                min-height: 20px;
            }
            QScrollBar::handle:vertical:hover {
                background-color: rgba(140, 140, 140, 0.8);
            }
        """
        )

        scroll_content = QWidget()
        layout = QVBoxLayout(scroll_content)
        layout.setContentsMargins(6, 6, 6, 6)
        layout.setSpacing(8)

        # AI Model Selection - collapsible
        model_collapsible = SimpleCollapsible("AI Model Selection", self.model_widget)
        layout.addWidget(model_collapsible)

        # AI Fragment Filter - collapsible
        fragment_collapsible = SimpleCollapsible(
            "AI Fragment Filter", self.fragment_widget
        )
        layout.addWidget(fragment_collapsible)

        # Application Settings - collapsible
        settings_collapsible = SimpleCollapsible(
            "Application Settings", self.settings_widget
        )
        layout.addWidget(settings_collapsible)

        layout.addStretch()

        scroll.setWidget(scroll_content)

        tab_layout = QVBoxLayout(tab_widget)
        tab_layout.setContentsMargins(0, 0, 0, 0)
        tab_layout.addWidget(scroll)

        return tab_widget

    def _create_processing_tab(self):
        """Create the Processing & Tools tab."""
        tab_widget = QWidget()

        # Create scroll area for processing controls
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        scroll.setStyleSheet(
            """
            QScrollArea {
                border: none;
                background: transparent;
            }
            QScrollBar:vertical {
                background-color: rgba(60, 60, 60, 0.5);
                width: 8px;
                border-radius: 4px;
            }
            QScrollBar::handle:vertical {
                background-color: rgba(120, 120, 120, 0.7);
                border-radius: 4px;
                min-height: 20px;
            }
            QScrollBar::handle:vertical:hover {
                background-color: rgba(140, 140, 140, 0.8);
            }
        """
        )

        scroll_content = QWidget()
        layout = QVBoxLayout(scroll_content)
        layout.setContentsMargins(6, 6, 6, 6)
        layout.setSpacing(8)

        # Border Crop - collapsible
        crop_collapsible = SimpleCollapsible("Border Crop", self.crop_widget)
        layout.addWidget(crop_collapsible)

        # Channel Threshold - collapsible
        threshold_collapsible = SimpleCollapsible(
            "Channel Threshold", self.channel_threshold_widget
        )
        layout.addWidget(threshold_collapsible)

        # Image Adjustments - collapsible
        adjustments_collapsible = SimpleCollapsible(
            "Image Adjustments", self.adjustments_widget
        )
        layout.addWidget(adjustments_collapsible)

        layout.addStretch()

        scroll.setWidget(scroll_content)

        tab_layout = QVBoxLayout(tab_widget)
        tab_layout.setContentsMargins(0, 0, 0, 0)
        tab_layout.addWidget(scroll)

        return tab_widget

    def _connect_signals(self):
        """Connect internal signals."""
        self.btn_sam_mode.clicked.connect(self._on_sam_mode_clicked)
        self.btn_polygon_mode.clicked.connect(self._on_polygon_mode_clicked)
        self.btn_bbox_mode.clicked.connect(self._on_bbox_mode_clicked)
        self.btn_selection_mode.clicked.connect(self._on_selection_mode_clicked)
        self.btn_edit_mode.clicked.connect(self._on_edit_mode_clicked)
        self.btn_hotkeys.clicked.connect(self.hotkeys_requested)
        self.btn_popout.clicked.connect(self.pop_out_requested)

        # Model widget signals
        self.model_widget.browse_requested.connect(self.browse_models_requested)
        self.model_widget.refresh_requested.connect(self.refresh_models_requested)
        self.model_widget.model_selected.connect(self.model_selected)

        # Settings widget signals
        self.settings_widget.settings_changed.connect(self.settings_changed)

        # Adjustments widget signals
        self.adjustments_widget.annotation_size_changed.connect(
            self.annotation_size_changed
        )
        self.adjustments_widget.pan_speed_changed.connect(self.pan_speed_changed)
        self.adjustments_widget.join_threshold_changed.connect(
            self.join_threshold_changed
        )
        self.adjustments_widget.brightness_changed.connect(self.brightness_changed)
        self.adjustments_widget.contrast_changed.connect(self.contrast_changed)
        self.adjustments_widget.gamma_changed.connect(self.gamma_changed)
        self.adjustments_widget.reset_requested.connect(
            self.reset_adjustments_requested
        )
        self.adjustments_widget.image_adjustment_changed.connect(
            self.image_adjustment_changed
        )

        # Fragment threshold widget signals
        self.fragment_widget.fragment_threshold_changed.connect(
            self.fragment_threshold_changed
        )

        # Border crop signals
        self.crop_widget.crop_draw_requested.connect(self.crop_draw_requested)
        self.crop_widget.crop_clear_requested.connect(self.crop_clear_requested)
        self.crop_widget.crop_applied.connect(self.crop_applied)

        # Channel threshold signals
        self.channel_threshold_widget.thresholdChanged.connect(
            self.channel_threshold_changed
        )

    def _on_sam_mode_clicked(self):
        """Handle AI mode button click."""
        self._set_active_mode_button(self.btn_sam_mode)
        self.sam_mode_requested.emit()

    def _on_polygon_mode_clicked(self):
        """Handle polygon mode button click."""
        self._set_active_mode_button(self.btn_polygon_mode)
        self.polygon_mode_requested.emit()

    def _on_bbox_mode_clicked(self):
        """Handle bbox mode button click."""
        self._set_active_mode_button(self.btn_bbox_mode)
        self.bbox_mode_requested.emit()

    def _on_selection_mode_clicked(self):
        """Handle selection mode button click."""
        self._set_active_mode_button(self.btn_selection_mode)
        self.selection_mode_requested.emit()

    def _on_edit_mode_clicked(self):
        """Handle edit mode button click."""
        # For now, emit the signal - the main window will handle polygon checking
        self.edit_mode_requested.emit()

    def _set_active_mode_button(self, active_button):
        """Set the active mode button and deactivate others."""
        mode_buttons = [
            self.btn_sam_mode,
            self.btn_polygon_mode,
            self.btn_bbox_mode,
            self.btn_selection_mode,
        ]

        # Clear all mode buttons
        for button in mode_buttons:
            button.setChecked(button == active_button if active_button else False)

        # Clear edit button when setting mode buttons
        if active_button and active_button != self.btn_edit_mode:
            self.btn_edit_mode.setChecked(False)

    def mouseDoubleClickEvent(self, event):
        """Handle double-click to expand collapsed panel."""
        if (
            self.width() < 50
            and self.parent()
            and hasattr(self.parent(), "_expand_left_panel")
        ):
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
        """Set the active mode by highlighting the corresponding button."""
        # Map internal mode names to buttons
        mode_buttons = {
            "sam_points": self.btn_sam_mode,
            "polygon": self.btn_polygon_mode,
            "bbox": self.btn_bbox_mode,
            "selection": self.btn_selection_mode,
            "edit": self.btn_edit_mode,
        }

        active_button = mode_buttons.get(mode)
        if active_button:
            # Clear all mode buttons first
            self._set_active_mode_button(None)
            # Set edit button separately if it's edit mode
            if mode == "edit":
                self.btn_edit_mode.setChecked(True)
            else:
                self._set_active_mode_button(active_button)

    def set_edit_mode_active(self, active: bool):
        """Set edit mode button as active or inactive."""
        if active:
            # Clear all mode buttons and set edit as active
            self._set_active_mode_button(None)
            self.btn_edit_mode.setChecked(True)
        else:
            self.btn_edit_mode.setChecked(False)

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

    def set_pan_speed(self, value):
        """Set pan speed."""
        self.adjustments_widget.set_pan_speed(value)

    def set_join_threshold(self, value):
        """Set join threshold."""
        self.adjustments_widget.set_join_threshold(value)

    def set_fragment_threshold(self, value):
        """Set fragment threshold."""
        self.fragment_widget.set_fragment_threshold(value)

    def set_brightness(self, value):
        """Set brightness."""
        self.adjustments_widget.set_brightness(value)

    def set_contrast(self, value):
        """Set contrast."""
        self.adjustments_widget.set_contrast(value)

    def set_gamma(self, value):
        """Set gamma."""
        self.adjustments_widget.set_gamma(value)

    def set_sam_mode_enabled(self, enabled: bool):
        """Enable or disable the SAM mode button."""
        self.btn_sam_mode.setEnabled(enabled)
        if not enabled:
            self.btn_sam_mode.setToolTip("AI Mode (SAM model not available)")
        else:
            self.btn_sam_mode.setToolTip("Switch to AI Mode for AI segmentation (1)")

    def set_popout_mode(self, is_popped_out: bool):
        """Update the pop-out button based on panel state."""
        if is_popped_out:
            self.btn_popout.setText("⇤")
            self.btn_popout.setToolTip("Return panel to main window")
        else:
            self.btn_popout.setText("⋯")
            self.btn_popout.setToolTip("Pop out panel to separate window")

    # Border crop delegate methods
    def set_crop_coordinates(self, x1, y1, x2, y2):
        """Set crop coordinates in the crop widget."""
        self.crop_widget.set_crop_coordinates(x1, y1, x2, y2)

    def clear_crop_coordinates(self):
        """Clear crop coordinates."""
        self.crop_widget.clear_crop_coordinates()

    def get_crop_coordinates(self):
        """Get current crop coordinates."""
        return self.crop_widget.get_crop_coordinates()

    def has_crop(self):
        """Check if crop coordinates are set."""
        return self.crop_widget.has_crop()

    def set_crop_status(self, message):
        """Set crop status message."""
        self.crop_widget.set_status(message)

    # Channel threshold delegate methods
    def update_channel_threshold_for_image(self, image_array):
        """Update channel threshold widget for new image."""
        self.channel_threshold_widget.update_for_image(image_array)

    def get_channel_threshold_widget(self):
        """Get the channel threshold widget."""
        return self.channel_threshold_widget
