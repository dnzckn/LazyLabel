"""UI Layout Manager for multi-view layout setup and management.

This manager handles:
- Multi-view layout creation (2-view or 4-view grid)
- Layout rebuilding when grid mode changes
- Layout cleanup and viewer management
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PyQt6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from ..photo_viewer import PhotoViewer

if TYPE_CHECKING:
    from ...viewmodels import MultiViewViewModel
    from ..main_window import MainWindow


class UILayoutManager:
    """Manages multi-view UI layout operations.

    This class consolidates all multi-view layout creation and management
    including grid setup, viewer creation, and layout cleanup.
    """

    def __init__(self, main_window: MainWindow):
        """Initialize the UI layout manager.

        Args:
            main_window: Parent MainWindow instance
        """
        self.mw = main_window

    # ========== Property Accessors ==========

    @property
    def viewmodel(self) -> MultiViewViewModel:
        """Get multi-view ViewModel for state access."""
        return self.mw.multi_view_viewmodel

    @property
    def settings(self):
        """Get settings from main window."""
        return self.mw.settings

    # ========== Configuration ==========

    def _create_viewer_panel(self, index: int) -> QWidget:
        """Create a viewer panel with header and photo viewer.

        Args:
            index: Viewer index

        Returns:
            Container widget with header and viewer
        """
        # Container for each image panel
        panel_container = QWidget()
        panel_layout = QVBoxLayout(panel_container)
        panel_layout.setContentsMargins(2, 2, 2, 2)
        panel_layout.setSpacing(2)

        # Header with filename and unlink button
        header_widget = QWidget()
        header_layout = QHBoxLayout(header_widget)
        header_layout.setContentsMargins(0, 0, 0, 0)

        info_label = QLabel(f"Image {index + 1}: No image loaded")
        info_label.setStyleSheet("font-weight: bold; padding: 2px;")
        header_layout.addWidget(info_label)

        unlink_button = QPushButton("X")
        unlink_button.setFixedSize(20, 20)
        unlink_button.setToolTip("Unlink this image from mirroring")
        unlink_button.clicked.connect(
            lambda checked, idx=index: self.mw._toggle_multi_view_link(idx)
        )
        header_layout.addWidget(unlink_button)

        panel_layout.addWidget(header_widget)

        # Photo viewer for this panel
        viewer = PhotoViewer()
        panel_layout.addWidget(viewer)

        # Store references
        self.mw.multi_view_viewers.append(viewer)
        self.mw.multi_view_info_labels.append(info_label)
        self.mw.multi_view_unlink_buttons.append(unlink_button)

        return panel_container

    def _create_controls_widget(self) -> QWidget:
        """Create the multi-view controls widget.

        Returns:
            Widget containing grid mode selector
        """
        controls_widget = QWidget()
        controls_layout = QHBoxLayout(controls_widget)

        # Grid mode selector
        grid_mode_label = QLabel("View Mode:")
        controls_layout.addWidget(grid_mode_label)

        from lazylabel.ui.widgets.model_selection_widget import CustomDropdown

        self.mw.grid_mode_combo = CustomDropdown()
        self.mw.grid_mode_combo.setText("View Mode")
        self.mw.grid_mode_combo.addItem("2 Views (1x2)", "2_view")
        self.mw.grid_mode_combo.addItem("4 Views (2x2)", "4_view")

        # Set current selection based on settings
        current_mode = self.settings.multi_view_grid_mode
        for i in range(len(self.mw.grid_mode_combo.items)):
            if self.mw.grid_mode_combo.itemData(i) == current_mode:
                self.mw.grid_mode_combo.setCurrentIndex(i)
                break

        self.mw.grid_mode_combo.activated.connect(self.on_grid_mode_changed)
        controls_layout.addWidget(self.mw.grid_mode_combo)

        controls_layout.addStretch()

        return controls_widget

    # ========== Grid Mode Change ==========

    def on_grid_mode_changed(self, index: int) -> None:
        """Handle grid mode change from combo box.

        Args:
            index: Selected index in combo box
        """
        current_data = self.mw.grid_mode_combo.itemData(index)
        if current_data and current_data != self.settings.multi_view_grid_mode:
            # Update settings
            self.settings.multi_view_grid_mode = current_data
            self.settings.save_to_file(str(self.mw.paths.settings_file))

            # For now, just show a notification that restart is needed
            # This avoids the complex Qt layout rebuilding issues
            self.mw._show_notification(
                "Grid mode changed. Please restart the application to apply changes.",
                duration=5000,
            )

    # ========== Layout Rebuild ==========
