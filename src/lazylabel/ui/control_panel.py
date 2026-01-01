"""Left control panel with mode controls and settings."""

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QCheckBox,
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QSlider,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from .widgets import (
    AdjustmentsWidget,
    AnnotationSettingsWidget,
    BorderCropWidget,
    ChannelThresholdWidget,
    FFTThresholdWidget,
    FragmentThresholdWidget,
    ModelSelectionWidget,
    SettingsWidget,
    ShortcutSpinBox,
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
                font-size: 11px;
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
                font-size: 12px;
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

    def set_collapsed(self, collapsed: bool):
        """Set the collapsed state programmatically."""
        if self.is_collapsed != collapsed:
            self.is_collapsed = collapsed
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
    saturation_changed = pyqtSignal(int)
    reset_adjustments_requested = pyqtSignal()
    image_adjustment_changed = pyqtSignal()
    # Slider drag tracking signals
    slider_drag_started = pyqtSignal()
    slider_drag_finished = pyqtSignal()
    hotkeys_requested = pyqtSignal()
    pop_out_requested = pyqtSignal()
    settings_changed = pyqtSignal()
    # Border crop signals
    crop_draw_requested = pyqtSignal()
    crop_clear_requested = pyqtSignal()
    crop_applied = pyqtSignal(int, int, int, int)  # x1, y1, x2, y2
    # Channel threshold signals
    channel_threshold_changed = pyqtSignal()
    channel_threshold_drag_started = pyqtSignal()
    channel_threshold_drag_finished = pyqtSignal()
    # FFT threshold signals
    fft_threshold_changed = pyqtSignal()
    # AI segment auto-conversion signals
    auto_polygon_toggled = pyqtSignal(bool)  # Emits new toggle state
    polygon_resolution_changed = pyqtSignal(float)  # Emits epsilon factor
    auto_polygon_reset = pyqtSignal()  # Emits when reset to defaults
    # Sequence settings signals
    sequence_range_changed = pyqtSignal(int)  # Emits propagation range
    sequence_max_requested = pyqtSignal()  # Request to set range to max (folder size)
    sequence_load_memory_requested = pyqtSignal()  # Request to preload images to memory
    sequence_clear_cache_requested = pyqtSignal()  # Request to clear memory cache

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumWidth(300)  # Wider for better text fitting
        self.preferred_width = 320
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
        self.fft_threshold_widget = FFTThresholdWidget()
        self.settings_widget = SettingsWidget()
        self.annotation_settings_widget = AnnotationSettingsWidget()
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
                font-size: 11px;
                min-width: 50px;
                max-width: 100px;
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
                font-size: 10px;
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
        button.setFixedWidth(90)  # Wider for better text fitting
        button.setStyleSheet(
            """
            QPushButton {
                background-color: rgba(60, 90, 120, 0.8);
                border: 1px solid rgba(80, 110, 140, 0.8);
                border-radius: 6px;
                color: #E0E0E0;
                font-weight: bold;
                font-size: 11px;
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
        button.setFixedWidth(90)  # Wider for better text fitting
        button.setStyleSheet(
            """
            QPushButton {
                background-color: rgba(70, 100, 130, 0.8);
                border: 1px solid rgba(90, 120, 150, 0.8);
                border-radius: 6px;
                color: #E0E0E0;
                font-weight: bold;
                font-size: 11px;
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
                font-size: 11px;
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
                font-size: 11px;
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

        # AI Segment Auto-Conversion - toggle to auto-convert AI segments to polygons
        convert_widget = QWidget()
        convert_layout = QVBoxLayout(convert_widget)
        convert_layout.setContentsMargins(0, 0, 0, 0)
        convert_layout.setSpacing(6)

        # Toggle button for auto-conversion
        self.btn_auto_polygon = QPushButton("Auto-Convert: OFF")
        self.btn_auto_polygon.setCheckable(True)
        self.btn_auto_polygon.setChecked(False)
        self.btn_auto_polygon.setToolTip(
            "When enabled, AI segments are automatically converted to polygons\n"
            "when you accept them (Spacebar). Toggle with P key."
        )
        self.btn_auto_polygon.setStyleSheet(
            """
            QPushButton {
                background-color: rgba(80, 80, 80, 0.8);
                border: 1px solid rgba(100, 100, 100, 0.8);
                border-radius: 6px;
                color: #E0E0E0;
                font-weight: bold;
                font-size: 11px;
                padding: 6px 12px;
                min-height: 24px;
            }
            QPushButton:hover {
                background-color: rgba(100, 100, 100, 0.9);
                border-color: rgba(120, 120, 120, 0.9);
            }
            QPushButton:checked {
                background-color: rgba(100, 80, 140, 0.9);
                border: 2px solid rgba(140, 120, 180, 1.0);
                color: #FFFFFF;
            }
            QPushButton:checked:hover {
                background-color: rgba(120, 100, 160, 0.95);
            }
        """
        )
        convert_layout.addWidget(self.btn_auto_polygon)

        # Resolution slider for polygon approximation
        resolution_label = QLabel("Polygon Resolution:")
        resolution_label.setStyleSheet("color: #B0B0B0; font-size: 10px;")
        convert_layout.addWidget(resolution_label)

        slider_layout = QHBoxLayout()
        slider_layout.setSpacing(4)

        # Label for "Simple"
        simple_label = QLabel("Simple")
        simple_label.setStyleSheet("color: #888; font-size: 9px;")
        slider_layout.addWidget(simple_label)

        # Slider: range 1-100, maps to epsilon 0.005 (simple) to 0.0001 (detailed)
        self.polygon_resolution_slider = QSlider(Qt.Orientation.Horizontal)
        self.polygon_resolution_slider.setRange(1, 100)
        self.polygon_resolution_slider.setValue(
            80
        )  # Default: 0.001 epsilon (good balance)
        self.polygon_resolution_slider.setToolTip(
            "Adjust how closely the polygon follows the AI mask.\n"
            "Simple = fewer points, Detailed = more points."
        )
        self.polygon_resolution_slider.setStyleSheet(
            """
            QSlider::groove:horizontal {
                background: rgba(60, 60, 60, 0.8);
                height: 6px;
                border-radius: 3px;
            }
            QSlider::handle:horizontal {
                background: rgba(120, 100, 160, 0.9);
                width: 14px;
                margin: -4px 0;
                border-radius: 7px;
            }
            QSlider::handle:horizontal:hover {
                background: rgba(140, 120, 180, 1.0);
            }
        """
        )
        slider_layout.addWidget(self.polygon_resolution_slider, 1)

        # Label for "Detailed"
        detailed_label = QLabel("Detailed")
        detailed_label.setStyleSheet("color: #888; font-size: 9px;")
        slider_layout.addWidget(detailed_label)

        convert_layout.addLayout(slider_layout)

        # Reset button for this section
        self.btn_reset_auto_polygon = QPushButton("Reset to Default")
        self.btn_reset_auto_polygon.setToolTip(
            "Reset auto-polygon settings to defaults"
        )
        self.btn_reset_auto_polygon.setStyleSheet(
            """
            QPushButton {
                background-color: rgba(60, 60, 60, 0.6);
                border: 1px solid rgba(80, 80, 80, 0.6);
                border-radius: 4px;
                color: #999;
                font-size: 9px;
                padding: 3px 8px;
            }
            QPushButton:hover {
                background-color: rgba(80, 80, 80, 0.7);
                color: #ccc;
            }
        """
        )
        convert_layout.addWidget(self.btn_reset_auto_polygon)

        convert_collapsible = SimpleCollapsible(
            "AI → Polygon Conversion", convert_widget
        )
        layout.addWidget(convert_collapsible)

        # Sequence Settings - collapsible
        sequence_widget = QWidget()
        sequence_layout = QVBoxLayout(sequence_widget)
        sequence_layout.setContentsMargins(0, 0, 0, 0)
        sequence_layout.setSpacing(6)

        # Propagation Range row
        range_row = QHBoxLayout()
        range_row.setSpacing(6)

        range_label = QLabel("Propagation Range:")
        range_label.setStyleSheet("color: #B0B0B0; font-size: 10px;")
        range_row.addWidget(range_label)

        self.sequence_range_spin = ShortcutSpinBox()
        self.sequence_range_spin.setRange(1, 10000)
        self.sequence_range_spin.setValue(50)
        self.sequence_range_spin.setToolTip(
            "Number of frames to propagate from the reference frame.\n"
            "If you label frame 0 with range 50, frames 0-49 will be auto-labeled."
        )
        self.sequence_range_spin.setStyleSheet(
            """
            QSpinBox {
                background-color: rgba(50, 50, 50, 0.8);
                border: 1px solid rgba(80, 80, 80, 0.6);
                border-radius: 4px;
                color: #E0E0E0;
                padding: 4px;
                min-width: 60px;
            }
            QSpinBox:hover {
                border-color: rgba(100, 100, 100, 0.8);
            }
            QSpinBox::up-button, QSpinBox::down-button {
                background: rgba(70, 70, 70, 0.8);
                border: none;
                width: 16px;
            }
            QSpinBox::up-button:hover, QSpinBox::down-button:hover {
                background: rgba(90, 90, 90, 0.9);
            }
        """
        )
        range_row.addWidget(self.sequence_range_spin)

        self.btn_sequence_max = QPushButton("Max")
        self.btn_sequence_max.setToolTip(
            "Set range to include all images in the folder"
        )
        self.btn_sequence_max.setFixedWidth(50)
        self.btn_sequence_max.setStyleSheet(
            """
            QPushButton {
                background-color: rgba(80, 80, 80, 0.8);
                border: 1px solid rgba(100, 100, 100, 0.6);
                border-radius: 4px;
                color: #E0E0E0;
                font-size: 10px;
                padding: 4px 8px;
            }
            QPushButton:hover {
                background-color: rgba(100, 100, 100, 0.9);
                border-color: rgba(120, 120, 120, 0.8);
            }
            QPushButton:pressed {
                background-color: rgba(60, 60, 60, 0.9);
            }
        """
        )
        range_row.addWidget(self.btn_sequence_max)
        range_row.addStretch()

        sequence_layout.addLayout(range_row)

        # Include masks checkbox
        self.chk_include_masks = QCheckBox("Include masks (NPZ files)")
        self.chk_include_masks.setToolTip(
            "Also preload mask data from NPZ files.\n"
            "This uses more memory but makes editing faster."
        )
        self.chk_include_masks.setChecked(False)
        sequence_layout.addWidget(self.chk_include_masks)

        # Load to Memory button
        self.btn_load_to_memory = QPushButton("Load Range to Memory")
        self.btn_load_to_memory.setToolTip(
            "Preload images within the range into memory.\n"
            "This makes scrubbing fast and speeds up AI propagation."
        )
        self.btn_load_to_memory.setStyleSheet(
            """
            QPushButton {
                background-color: rgba(60, 100, 80, 0.8);
                border: 1px solid rgba(80, 120, 100, 0.8);
                border-radius: 6px;
                color: #E0E0E0;
                font-weight: bold;
                font-size: 11px;
                padding: 8px 12px;
                min-height: 24px;
            }
            QPushButton:hover {
                background-color: rgba(80, 120, 100, 0.9);
                border-color: rgba(100, 140, 120, 0.9);
            }
            QPushButton:pressed {
                background-color: rgba(40, 80, 60, 0.9);
            }
            QPushButton:disabled {
                background-color: rgba(60, 60, 60, 0.5);
                border-color: rgba(80, 80, 80, 0.4);
                color: #888;
            }
        """
        )
        sequence_layout.addWidget(self.btn_load_to_memory)

        # Memory status row with clear button
        memory_row = QHBoxLayout()
        memory_row.setSpacing(6)

        self.sequence_memory_label = QLabel("Memory: Not loaded")
        self.sequence_memory_label.setStyleSheet(
            "color: #888; font-size: 9px; font-style: italic;"
        )
        memory_row.addWidget(self.sequence_memory_label, 1)

        self.btn_clear_cache = QPushButton("Clear")
        self.btn_clear_cache.setToolTip("Clear preloaded images from memory")
        self.btn_clear_cache.setFixedWidth(50)
        self.btn_clear_cache.setStyleSheet(
            """
            QPushButton {
                background-color: rgba(100, 60, 60, 0.8);
                border: 1px solid rgba(120, 80, 80, 0.6);
                border-radius: 4px;
                color: #E0E0E0;
                font-size: 9px;
                padding: 2px 6px;
            }
            QPushButton:hover {
                background-color: rgba(120, 80, 80, 0.9);
                border-color: rgba(140, 100, 100, 0.8);
            }
            QPushButton:pressed {
                background-color: rgba(80, 40, 40, 0.9);
            }
        """
        )
        memory_row.addWidget(self.btn_clear_cache)

        sequence_layout.addLayout(memory_row)

        self.sequence_collapsible = SimpleCollapsible(
            "Sequence Settings", sequence_widget
        )
        # Store the inner widget for enabling/disabling
        self.sequence_settings_widget = sequence_widget
        layout.addWidget(self.sequence_collapsible)
        # Always enabled - memory preload is useful in ALL modes

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
        self.channel_threshold_collapsible = SimpleCollapsible(
            "Channel Threshold", self.channel_threshold_widget
        )
        layout.addWidget(self.channel_threshold_collapsible)

        # FFT Threshold - collapsible (default collapsed)
        self.fft_threshold_collapsible = SimpleCollapsible(
            "FFT Threshold", self.fft_threshold_widget
        )
        self.fft_threshold_collapsible.set_collapsed(True)  # Default to collapsed
        layout.addWidget(self.fft_threshold_collapsible)

        # Annotation Settings - collapsible
        annotation_settings_collapsible = SimpleCollapsible(
            "Annotation Settings", self.annotation_settings_widget
        )
        layout.addWidget(annotation_settings_collapsible)

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

        # Annotation settings widget signals
        self.annotation_settings_widget.annotation_size_changed.connect(
            self.annotation_size_changed
        )
        self.annotation_settings_widget.pan_speed_changed.connect(
            self.pan_speed_changed
        )
        self.annotation_settings_widget.join_threshold_changed.connect(
            self.join_threshold_changed
        )

        # Image adjustments widget signals
        self.adjustments_widget.brightness_changed.connect(self.brightness_changed)
        self.adjustments_widget.contrast_changed.connect(self.contrast_changed)
        self.adjustments_widget.gamma_changed.connect(self.gamma_changed)
        self.adjustments_widget.saturation_changed.connect(self.saturation_changed)
        self.adjustments_widget.reset_requested.connect(
            self.reset_adjustments_requested
        )
        self.adjustments_widget.image_adjustment_changed.connect(
            self.image_adjustment_changed
        )
        # Connect slider drag tracking signals
        self.adjustments_widget.slider_drag_started.connect(self.slider_drag_started)
        self.adjustments_widget.slider_drag_finished.connect(self.slider_drag_finished)

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
        self.channel_threshold_widget.dragStarted.connect(
            self.channel_threshold_drag_started
        )
        self.channel_threshold_widget.dragFinished.connect(
            self.channel_threshold_drag_finished
        )

        # FFT threshold signals
        self.fft_threshold_widget.fft_threshold_changed.connect(
            self.fft_threshold_changed
        )

        # AI segment auto-conversion signals
        self.btn_auto_polygon.toggled.connect(self._on_auto_polygon_toggled)
        self.polygon_resolution_slider.valueChanged.connect(
            self._on_polygon_resolution_changed
        )
        self.btn_reset_auto_polygon.clicked.connect(
            self._reset_auto_polygon_to_defaults
        )

        # Sequence settings signals
        self.sequence_range_spin.valueChanged.connect(self.sequence_range_changed)
        self.btn_sequence_max.clicked.connect(self.sequence_max_requested)
        self.btn_load_to_memory.clicked.connect(self.sequence_load_memory_requested)
        self.btn_clear_cache.clicked.connect(self.sequence_clear_cache_requested)

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
            "ai": self.btn_sam_mode,  # AI mode uses the same button as SAM mode
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
        return self.annotation_settings_widget.get_annotation_size()

    def set_annotation_size(self, value):
        """Set annotation size."""
        self.annotation_settings_widget.set_annotation_size(value)

    def set_pan_speed(self, value):
        """Set pan speed."""
        self.annotation_settings_widget.set_pan_speed(value)

    def set_join_threshold(self, value):
        """Set join threshold."""
        self.annotation_settings_widget.set_join_threshold(value)

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

        # Auto-expand channel threshold panel when any image is loaded
        if image_array is not None and hasattr(self, "channel_threshold_collapsible"):
            # Find and expand the Channel Threshold panel
            self.channel_threshold_collapsible.set_collapsed(False)

    def get_channel_threshold_widget(self):
        """Get the channel threshold widget."""
        return self.channel_threshold_widget

    # FFT threshold delegate methods
    def update_fft_threshold_for_image(self, image_array):
        """Update FFT threshold widget for new image."""
        self.fft_threshold_widget.update_fft_threshold_for_image(image_array)

    def get_fft_threshold_widget(self):
        """Get the FFT threshold widget."""
        return self.fft_threshold_widget

    def auto_collapse_fft_threshold_for_image(self, image_array):
        """Auto-collapse FFT threshold panel if image is not black and white."""
        if not hasattr(self, "fft_threshold_collapsible"):
            return

        should_collapse = True  # Default to collapsed

        if image_array is not None:
            # Check if image is grayscale (black and white)
            if len(image_array.shape) == 2:
                # True grayscale - keep expanded
                should_collapse = False
            elif len(image_array.shape) == 3 and image_array.shape[2] == 3:
                # Check if all three channels are identical (grayscale stored as RGB)
                import numpy as np

                r_channel = image_array[:, :, 0]
                g_channel = image_array[:, :, 1]
                b_channel = image_array[:, :, 2]
                if np.array_equal(r_channel, g_channel) and np.array_equal(
                    g_channel, b_channel
                ):
                    # Grayscale stored as RGB - keep expanded
                    should_collapse = False

        # Set collapsed state (collapse for non-BW images, expand for BW images)
        self.fft_threshold_collapsible.set_collapsed(should_collapse)

    # AI → Polygon conversion methods
    def _on_auto_polygon_toggled(self, checked: bool):
        """Handle auto-polygon toggle change."""
        self.btn_auto_polygon.setText(f"Auto-Convert: {'ON' if checked else 'OFF'}")
        self.auto_polygon_toggled.emit(checked)

    def _on_polygon_resolution_changed(self, value: int):
        """Handle polygon resolution slider change."""
        # Convert slider value (1-100) to epsilon factor
        # Slider 1 = epsilon 0.005 (simple, few points)
        # Slider 100 = epsilon 0.0001 (detailed, many points)
        # Use logarithmic mapping for better control
        epsilon = 0.005 * (0.02 ** (value / 100.0))
        self.polygon_resolution_changed.emit(epsilon)

    def set_auto_polygon_enabled(self, enabled: bool):
        """Set the auto-polygon toggle state programmatically."""
        self.btn_auto_polygon.blockSignals(True)
        self.btn_auto_polygon.setChecked(enabled)
        self.btn_auto_polygon.setText(f"Auto-Convert: {'ON' if enabled else 'OFF'}")
        self.btn_auto_polygon.blockSignals(False)

    def is_auto_polygon_enabled(self) -> bool:
        """Check if auto-polygon conversion is enabled."""
        return self.btn_auto_polygon.isChecked()

    def get_polygon_epsilon(self) -> float:
        """Get the current polygon epsilon factor from slider."""
        value = self.polygon_resolution_slider.value()
        return 0.005 * (0.02 ** (value / 100.0))

    def toggle_auto_polygon(self):
        """Toggle the auto-polygon feature."""
        self.btn_auto_polygon.setChecked(not self.btn_auto_polygon.isChecked())

    def _reset_auto_polygon_to_defaults(self):
        """Reset auto-polygon settings to default values."""
        # Default values: OFF, resolution slider at 80
        self.set_auto_polygon_enabled(False)
        self.polygon_resolution_slider.setValue(80)
        # Emit signals to update main window state
        self.auto_polygon_toggled.emit(False)
        self.polygon_resolution_changed.emit(self.get_polygon_epsilon())
        self.auto_polygon_reset.emit()

    # =========================================================================
    # Sequence Settings Methods
    # =========================================================================

    def _set_sequence_settings_enabled(self, enabled: bool) -> None:
        """Internal method to enable/disable sequence settings visually."""
        # Disable all interactive elements
        self.sequence_range_spin.setEnabled(enabled)
        self.btn_sequence_max.setEnabled(enabled)
        self.btn_load_to_memory.setEnabled(enabled)

        # Gray out the collapsible header when disabled
        if enabled:
            self.sequence_collapsible.setStyleSheet("")
            self.sequence_settings_widget.setStyleSheet("")
        else:
            self.sequence_collapsible.setStyleSheet("color: #666;")
            self.sequence_settings_widget.setStyleSheet(
                "QWidget { color: #666; } "
                "QLabel { color: #555; } "
                "QPushButton { background-color: rgba(50, 50, 50, 0.5); color: #555; } "
                "QSpinBox { background-color: rgba(40, 40, 40, 0.5); color: #555; }"
            )

    def set_sequence_mode_active(self, active: bool) -> None:
        """Enable/disable sequence settings based on whether sequence mode is active.

        Call this when switching view modes.

        Args:
            active: True if entering sequence mode, False otherwise
        """
        self._set_sequence_settings_enabled(active)
        # Auto-expand when entering sequence mode, collapse when leaving
        if (
            active
            and self.sequence_collapsible.is_collapsed
            or not active
            and not self.sequence_collapsible.is_collapsed
        ):
            self.sequence_collapsible.toggle_collapse()

    def get_sequence_range(self) -> int:
        """Get the current propagation range value."""
        return self.sequence_range_spin.value()

    def should_include_masks(self) -> bool:
        """Check if masks should be included when loading to memory."""
        return self.chk_include_masks.isChecked()

    def set_sequence_range(self, value: int) -> None:
        """Set the propagation range value."""
        self.sequence_range_spin.blockSignals(True)
        self.sequence_range_spin.setValue(value)
        self.sequence_range_spin.blockSignals(False)

    def set_sequence_range_max(self, max_value: int) -> None:
        """Set the maximum allowed range (e.g., folder size)."""
        self.sequence_range_spin.setMaximum(max_value)

    def update_sequence_memory_status(
        self, loaded: int, total: int, size_mb: float = 0
    ) -> None:
        """Update the memory status label.

        Args:
            loaded: Number of images loaded in memory
            total: Total images in range
            size_mb: Approximate memory size in MB
        """
        if loaded == 0:
            self.sequence_memory_label.setText("Memory: Not loaded")
            self.sequence_memory_label.setStyleSheet(
                "color: #888; font-size: 9px; font-style: italic;"
            )
        else:
            if size_mb > 0:
                self.sequence_memory_label.setText(
                    f"Memory: {loaded}/{total} images ({size_mb:.1f} MB)"
                )
            else:
                self.sequence_memory_label.setText(f"Memory: {loaded}/{total} images")
            self.sequence_memory_label.setStyleSheet(
                "color: #4CAF50; font-size: 9px; font-style: italic;"
            )

    def set_load_memory_button_loading(self, is_loading: bool) -> None:
        """Set the load to memory button to loading state."""
        if is_loading:
            self.btn_load_to_memory.setText("Loading...")
            self.btn_load_to_memory.setEnabled(False)
        else:
            self.btn_load_to_memory.setText("Load Range to Memory")
            self.btn_load_to_memory.setEnabled(True)
