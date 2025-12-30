"""Panel popout manager for handling panel pop-out/return functionality."""

from __future__ import annotations

from typing import TYPE_CHECKING

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import QDialog, QVBoxLayout, QWidget

if TYPE_CHECKING:
    from ..main_window import MainWindow


class PanelPopoutWindow(QDialog):
    """Pop-out window for draggable panels."""

    panel_closed = pyqtSignal(QWidget)  # Signal emitted when panel window is closed

    def __init__(self, panel_widget: QWidget, title: str = "Panel", parent=None):
        super().__init__(parent)
        self.panel_widget = panel_widget
        self.setWindowTitle(title)
        self.setWindowFlags(Qt.WindowType.Window)  # Allow moving to other monitors

        # Make window resizable
        self.setMinimumSize(200, 300)
        self.resize(400, 600)

        # Set up layout
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        layout.addWidget(panel_widget)

        # Store original parent for restoration
        self.original_parent = parent
        self.main_window = parent  # Store reference to main window for key forwarding

    def keyPressEvent(self, event):
        """Forward key events to main window to preserve hotkey functionality."""
        if self.main_window and hasattr(self.main_window, "keyPressEvent"):
            # Forward the key event to the main window
            self.main_window.keyPressEvent(event)
        else:
            # Default handling if main window not available
            super().keyPressEvent(event)

    def closeEvent(self, event):
        """Handle window close - emit signal to return panel to main window."""
        self.panel_closed.emit(self.panel_widget)
        super().closeEvent(event)


class PanelPopoutManager:
    """Manages panel pop-out functionality for left and right panels."""

    def __init__(self, main_window: MainWindow):
        self.main_window = main_window
        self.left_panel_popout: PanelPopoutWindow | None = None
        self.right_panel_popout: PanelPopoutWindow | None = None

    def pop_out_left_panel(self) -> None:
        """Pop out the left control panel into a separate window."""
        mw = self.main_window

        if self.left_panel_popout is not None:
            # Panel is already popped out, return it to main window
            self.return_left_panel(mw.control_panel)
            return

        # Remove panel from main splitter
        mw.control_panel.setParent(None)

        # Create pop-out window
        self.left_panel_popout = PanelPopoutWindow(
            mw.control_panel, "Control Panel", mw
        )
        self.left_panel_popout.panel_closed.connect(self.return_left_panel)
        self.left_panel_popout.show()

        # Update panel's pop-out button
        mw.control_panel.set_popout_mode(True)

        # Make pop-out window resizable
        self.left_panel_popout.setMinimumSize(200, 400)
        self.left_panel_popout.resize(mw.control_panel.preferred_width + 20, 600)

    def pop_out_right_panel(self) -> None:
        """Pop out the right panel into a separate window."""
        mw = self.main_window

        if self.right_panel_popout is not None:
            # Panel is already popped out, return it to main window
            self.return_right_panel(mw.right_panel)
            return

        # Remove panel from main splitter
        mw.right_panel.setParent(None)

        # Create pop-out window
        self.right_panel_popout = PanelPopoutWindow(
            mw.right_panel, "File Explorer & Segments", mw
        )
        self.right_panel_popout.panel_closed.connect(self.return_right_panel)
        self.right_panel_popout.show()

        # Update panel's pop-out button
        mw.right_panel.set_popout_mode(True)

        # Make pop-out window resizable
        self.right_panel_popout.setMinimumSize(250, 400)
        self.right_panel_popout.resize(mw.right_panel.preferred_width + 20, 600)

    def return_left_panel(self, panel_widget: QWidget) -> None:
        """Return the left panel to the main window."""
        mw = self.main_window

        if self.left_panel_popout is not None:
            # Close the pop-out window
            self.left_panel_popout.close()

            # Return panel to main splitter
            mw.main_splitter.insertWidget(0, mw.control_panel)
            self.left_panel_popout = None

            # Update panel's pop-out button
            mw.control_panel.set_popout_mode(False)

            # Restore splitter sizes
            mw.main_splitter.setSizes([250, 800, 350])

    def return_right_panel(self, panel_widget: QWidget) -> None:
        """Return the right panel to the main window."""
        mw = self.main_window

        if self.right_panel_popout is not None:
            # Close the pop-out window
            self.right_panel_popout.close()

            # Return panel to main splitter
            mw.main_splitter.addWidget(mw.right_panel)
            self.right_panel_popout = None

            # Update panel's pop-out button
            mw.right_panel.set_popout_mode(False)

            # Restore splitter sizes
            mw.main_splitter.setSizes([250, 800, 350])

    def handle_splitter_moved(self, pos: int, index: int) -> None:
        """Handle splitter movement for intelligent expand/collapse behavior."""
        mw = self.main_window
        sizes = mw.main_splitter.sizes()

        # Left panel (index 0) - expand/collapse logic
        if index == 1:  # Splitter between left panel and viewer
            left_size = sizes[0]
            # Only snap to collapsed if user drags very close to collapse
            if left_size < 50:  # Collapsed threshold
                # Panel is being collapsed, snap to collapsed state
                new_sizes = [0] + sizes[1:]
                new_sizes[1] = new_sizes[1] + left_size  # Give space back to viewer
                mw.main_splitter.setSizes(new_sizes)
                # Temporarily override minimum width to allow collapsing
                mw.control_panel.setMinimumWidth(0)

        # Right panel (index 2) - expand/collapse logic
        elif index == 2:  # Splitter between viewer and right panel
            right_size = sizes[2]
            # Only snap to collapsed if user drags very close to collapse
            if right_size < 50:  # Collapsed threshold
                # Panel is being collapsed, snap to collapsed state
                new_sizes = sizes[:-1] + [0]
                new_sizes[1] = new_sizes[1] + right_size  # Give space back to viewer
                mw.main_splitter.setSizes(new_sizes)
                # Temporarily override minimum width to allow collapsing
                mw.right_panel.setMinimumWidth(0)

    def expand_left_panel(self) -> None:
        """Expand the left panel to its preferred width."""
        mw = self.main_window
        sizes = mw.main_splitter.sizes()

        if sizes[0] < 50:  # Only expand if currently collapsed
            # Restore minimum width first
            mw.control_panel.setMinimumWidth(mw.control_panel.preferred_width)

            space_needed = mw.control_panel.preferred_width
            viewer_width = sizes[1] - space_needed
            if viewer_width > 400:  # Ensure viewer has minimum space
                new_sizes = [mw.control_panel.preferred_width, viewer_width] + sizes[2:]
                mw.main_splitter.setSizes(new_sizes)

    def expand_right_panel(self) -> None:
        """Expand the right panel to its preferred width."""
        mw = self.main_window
        sizes = mw.main_splitter.sizes()

        if sizes[2] < 50:  # Only expand if currently collapsed
            # Restore minimum width first
            mw.right_panel.setMinimumWidth(mw.right_panel.preferred_width)

            space_needed = mw.right_panel.preferred_width
            viewer_width = sizes[1] - space_needed
            if viewer_width > 400:  # Ensure viewer has minimum space
                new_sizes = sizes[:-1] + [viewer_width, mw.right_panel.preferred_width]
                mw.main_splitter.setSizes(new_sizes)
