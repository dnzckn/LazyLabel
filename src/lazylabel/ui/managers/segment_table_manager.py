"""Segment table manager for UI list and table operations."""

from __future__ import annotations

from typing import TYPE_CHECKING

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QBrush
from PyQt6.QtWidgets import QTableWidgetItem

from ..numeric_table_widget_item import NumericTableWidgetItem

if TYPE_CHECKING:
    from ...core.segment_manager import SegmentManager
    from ..main_window import MainWindow
    from ..right_panel import RightPanel
    from .segment_display_manager import SegmentDisplayManager


class SegmentTableManager:
    """Manages segment table and class list UI operations.

    This manager handles:
    - Segment table updates (full and incremental)
    - Class list management
    - Class filter operations
    - Segment deletion and class assignment
    """

    def __init__(self, main_window: MainWindow):
        self.main_window = main_window

    @property
    def segment_manager(self) -> SegmentManager:
        """Get segment manager from main window."""
        return self.main_window.segment_manager

    @property
    def right_panel(self) -> RightPanel:
        """Get right panel from main window."""
        return self.main_window.right_panel

    @property
    def segment_display_manager(self) -> SegmentDisplayManager:
        """Get segment display manager from main window."""
        return self.main_window.segment_display_manager

    def assign_selected_to_class(self) -> None:
        """Assign selected segments to the active class."""
        selected_indices = self.right_panel.get_selected_segment_indices()
        self.segment_manager.assign_segments_to_class(selected_indices)
        self.update_all_lists()

    def delete_selected_segments(self) -> None:
        """Delete selected segments and remove any highlight overlays."""
        mw = self.main_window

        # Remove highlight overlays before deleting segments
        if hasattr(mw, "highlight_items"):
            for item in mw.highlight_items:
                if item.scene():
                    item.scene().removeItem(item)
            mw.highlight_items = []

        # Also clear multi-view highlight items
        if hasattr(mw, "multi_view_highlight_items"):
            for _viewer_idx, items in mw.multi_view_highlight_items.items():
                for item in items:
                    if item.scene():
                        item.scene().removeItem(item)
            config = mw._get_multi_view_config()
            num_viewers = config["num_viewers"]
            mw.multi_view_highlight_items = {i: [] for i in range(num_viewers)}

        selected_indices = self.right_panel.get_selected_segment_indices()
        self.segment_manager.delete_segments(selected_indices)

        # Clear ALL pixmap caches when segments are deleted
        self.segment_display_manager.clear_pixmap_caches()

        self.update_all_lists()

    def handle_alias_change(self, class_id: int, alias: str) -> None:
        """Handle class alias change."""
        mw = self.main_window
        if mw._updating_lists:
            return  # Prevent recursion
        self.segment_manager.set_class_alias(class_id, alias)
        self.update_all_lists()

    def reassign_class_ids(self) -> None:
        """Reassign class IDs based on current order."""
        new_order = self.right_panel.get_class_order()
        self.segment_manager.reassign_class_ids(new_order)
        self.update_all_lists()

    def update_segment_table(self) -> None:
        """Rebuild the segment table from scratch."""
        mw = self.main_window
        table = self.right_panel.segment_table
        table.blockSignals(True)
        selected_indices = self.right_panel.get_selected_segment_indices()
        table.clearContents()
        table.setRowCount(0)

        # Get current filter
        show_all, filter_class_id = self.get_current_table_filter()

        # Filter segments based on class filter
        display_segments = []
        for i, seg in enumerate(self.segment_manager.segments):
            if self.segment_passes_filter(seg, show_all, filter_class_id):
                display_segments.append((i, seg))

        table.setRowCount(len(display_segments))

        # Populate table rows
        for row, (original_index, seg) in enumerate(display_segments):
            class_id = seg.get("class_id")
            color = self.segment_display_manager.get_color_for_class(class_id)
            class_id_str = str(class_id) if class_id is not None else "N/A"

            alias_str = "N/A"
            if class_id is not None:
                alias_str = self.segment_manager.get_class_alias(class_id)

            # Create table items (1-based segment ID for display)
            index_item = NumericTableWidgetItem(str(original_index + 1))
            class_item = NumericTableWidgetItem(class_id_str)
            alias_item = QTableWidgetItem(alias_str)

            # Set items as non-editable
            index_item.setFlags(index_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            class_item.setFlags(class_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            alias_item.setFlags(alias_item.flags() & ~Qt.ItemFlag.ItemIsEditable)

            # Store original index for selection tracking
            index_item.setData(Qt.ItemDataRole.UserRole, original_index)

            # Set items in table
            table.setItem(row, 0, index_item)
            table.setItem(row, 1, class_item)
            table.setItem(row, 2, alias_item)

            # Set background color based on class
            for col in range(table.columnCount()):
                if table.item(row, col):
                    table.item(row, col).setBackground(QBrush(color))

        # Restore selection
        table.setSortingEnabled(False)
        for row in range(table.rowCount()):
            item = table.item(row, 0)
            if item and item.data(Qt.ItemDataRole.UserRole) in selected_indices:
                table.selectRow(row)
        table.setSortingEnabled(True)

        table.blockSignals(False)
        mw.viewer.setFocus()

        # Update active class display
        active_class = self.segment_manager.get_active_class()
        self.right_panel.update_active_class_display(active_class)

    def get_current_table_filter(self) -> tuple[bool, int]:
        """Get the current table filter settings.

        Returns:
            Tuple of (show_all: bool, filter_class_id: int)
        """
        filter_text = self.right_panel.class_filter_combo.currentText()
        show_all = filter_text == "All Classes"
        filter_class_id = -1
        if not show_all:
            try:
                if ":" in filter_text:
                    filter_class_id = int(filter_text.split(":")[-1].strip())
                else:
                    filter_class_id = int(filter_text.split()[-1])
            except (ValueError, IndexError):
                show_all = True
        return show_all, filter_class_id

    def segment_passes_filter(
        self, segment: dict, show_all: bool, filter_class_id: int
    ) -> bool:
        """Check if a segment passes the current filter.

        Args:
            segment: The segment dict
            show_all: Whether "All Classes" filter is active
            filter_class_id: The class ID to filter by (if not show_all)

        Returns:
            True if segment should be shown in table
        """
        if show_all:
            return True
        return segment.get("class_id") == filter_class_id

    def add_row_to_segment_table(self, segment_index: int) -> None:
        """Add a single row to the segment table for a new segment.

        This is O(1) compared to full table rebuild which is O(n).

        Args:
            segment_index: Index of the newly added segment
        """
        if segment_index >= len(self.segment_manager.segments):
            return

        segment = self.segment_manager.segments[segment_index]
        show_all, filter_class_id = self.get_current_table_filter()

        # Check if segment passes current filter
        if not self.segment_passes_filter(segment, show_all, filter_class_id):
            return  # Segment filtered out, no table change needed

        table = self.right_panel.segment_table
        table.blockSignals(True)

        try:
            # Add new row at end
            row = table.rowCount()
            table.insertRow(row)

            # Get segment data
            class_id = segment.get("class_id")
            color = self.segment_display_manager.get_color_for_class(class_id)
            class_id_str = str(class_id) if class_id is not None else "N/A"
            alias_str = (
                self.segment_manager.get_class_alias(class_id)
                if class_id is not None
                else "N/A"
            )

            # Create table items (1-based segment ID for display)
            index_item = NumericTableWidgetItem(str(segment_index + 1))
            class_item = NumericTableWidgetItem(class_id_str)
            alias_item = QTableWidgetItem(alias_str)

            # Set items as non-editable
            index_item.setFlags(index_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            class_item.setFlags(class_item.flags() & ~Qt.ItemFlag.ItemIsEditable)
            alias_item.setFlags(alias_item.flags() & ~Qt.ItemFlag.ItemIsEditable)

            # Store original index for selection tracking
            index_item.setData(Qt.ItemDataRole.UserRole, segment_index)

            # Set items in table
            table.setItem(row, 0, index_item)
            table.setItem(row, 1, class_item)
            table.setItem(row, 2, alias_item)

            # Set background color
            for col in range(table.columnCount()):
                if table.item(row, col):
                    table.item(row, col).setBackground(QBrush(color))
        finally:
            table.blockSignals(False)

    def remove_row_from_segment_table(self, segment_index: int) -> None:
        """Remove a row from segment table and shift remaining indices.

        This is O(n) for the shift but avoids full table rebuild overhead.

        Args:
            segment_index: Index of the removed segment
        """
        table = self.right_panel.segment_table
        table.blockSignals(True)

        try:
            # Find the row with this segment index
            row_to_remove = None
            for row in range(table.rowCount()):
                item = table.item(row, 0)
                if item and item.data(Qt.ItemDataRole.UserRole) == segment_index:
                    row_to_remove = row
                    break

            if row_to_remove is not None:
                # Remove the row
                table.removeRow(row_to_remove)

            # Shift indices for all rows with segment_index > removed index
            for row in range(table.rowCount()):
                item = table.item(row, 0)
                if item:
                    stored_index = item.data(Qt.ItemDataRole.UserRole)
                    if stored_index is not None and stored_index > segment_index:
                        # Decrement the stored index
                        new_index = stored_index - 1
                        item.setData(Qt.ItemDataRole.UserRole, new_index)
                        # Update the displayed text (1-based)
                        item.setText(str(new_index + 1))
        finally:
            table.blockSignals(False)

    def update_all_lists(self, invalidate_cache: bool = True) -> None:
        """Update all UI lists.

        Args:
            invalidate_cache: If True, invalidate segment cache before display.
                             Set False for selection-only changes to avoid
                             unnecessary pixmap regeneration.
        """
        mw = self.main_window
        if mw._updating_lists:
            return  # Prevent recursion

        mw._updating_lists = True
        try:
            self.update_class_list()
            self.update_segment_table()
            self.update_class_filter()
            # Invalidate segment cache before displaying to ensure fresh pixmaps
            if invalidate_cache:
                self.segment_display_manager.invalidate_cache()
            mw._display_all_segments()
            if mw.mode == "edit":
                if mw.view_mode == "multi":
                    mw._display_multi_view_edit_handles()
                else:
                    mw._display_edit_handles()
            else:
                if mw.view_mode == "multi":
                    mw._clear_multi_view_edit_handles()
                else:
                    mw._clear_edit_handles()
        finally:
            mw._updating_lists = False

    def update_class_list(self) -> None:
        """Update the class list in the right panel."""
        class_table = self.right_panel.class_table
        class_table.blockSignals(True)

        # Get unique class IDs
        unique_class_ids = self.segment_manager.get_unique_class_ids()

        class_table.clearContents()
        class_table.setRowCount(len(unique_class_ids))

        for row, cid in enumerate(unique_class_ids):
            alias_item = QTableWidgetItem(self.segment_manager.get_class_alias(cid))
            id_item = QTableWidgetItem(str(cid))
            id_item.setFlags(id_item.flags() & ~Qt.ItemFlag.ItemIsEditable)

            color = self.segment_display_manager.get_color_for_class(cid)
            alias_item.setBackground(QBrush(color))
            id_item.setBackground(QBrush(color))

            class_table.setItem(row, 0, alias_item)
            class_table.setItem(row, 1, id_item)

        # Update active class display BEFORE re-enabling signals
        active_class = self.segment_manager.get_active_class()
        self.right_panel.update_active_class_display(active_class)

        class_table.blockSignals(False)

    def update_class_filter(self) -> None:
        """Update the class filter combo box."""
        combo = self.right_panel.class_filter_combo
        current_text = combo.currentText()

        combo.blockSignals(True)
        combo.clear()
        combo.addItem("All Classes")

        # Add class options
        unique_class_ids = self.segment_manager.get_unique_class_ids()
        for class_id in unique_class_ids:
            alias = self.segment_manager.get_class_alias(class_id)
            display_text = f"{alias}: {class_id}" if alias else f"Class {class_id}"
            combo.addItem(display_text)

        # Restore selection if possible
        index = combo.findText(current_text)
        if index >= 0:
            combo.setCurrentIndex(index)
        else:
            combo.setCurrentIndex(0)

        combo.blockSignals(False)

    def update_lists_incremental(
        self,
        added_segment_index: int | None = None,
        removed_indices: list | None = None,
    ) -> None:
        """Update UI lists with incremental segment display updates.

        This is more efficient than update_all_lists when only adding/removing segments.
        Uses O(1) table operations instead of O(n) full rebuild.

        Args:
            added_segment_index: Index of newly added segment (if any)
            removed_indices: List of removed segment indices (if any)
        """
        mw = self.main_window
        if mw._updating_lists:
            return

        mw._updating_lists = True
        try:
            # Always update class list (relatively cheap, needed for new classes)
            self.update_class_list()

            # Handle segment table incrementally
            if removed_indices:
                # Sort in descending order to handle multiple deletions correctly
                for idx in sorted(removed_indices, reverse=True):
                    # Remove from table first (before display removal)
                    self.remove_row_from_segment_table(idx)
                    # Remove from display
                    mw._remove_segment_from_display(idx)
                    # Shift segment_items indices after deletion
                    self.shift_segment_items_after_deletion(idx)
                    # Shift cache entries to preserve cached pixmaps
                    self.segment_display_manager.shift_cache_after_deletion(idx)
            elif added_segment_index is not None:
                # Add row to table (O(1))
                self.add_row_to_segment_table(added_segment_index)
                # Add to display
                mw._add_segment_to_display(added_segment_index)
            else:
                # Fallback to full refresh for table and display
                self.update_segment_table()
                mw._display_all_segments()

            # Update class filter (may have new classes)
            self.update_class_filter()

            # Handle edit handles
            if mw.mode == "edit":
                if mw.view_mode == "multi":
                    mw._display_multi_view_edit_handles()
                else:
                    mw._display_edit_handles()
            else:
                if mw.view_mode == "multi":
                    mw._clear_multi_view_edit_handles()
                else:
                    mw._clear_edit_handles()
        finally:
            mw._updating_lists = False

    def shift_segment_items_after_deletion(self, deleted_index: int) -> None:
        """Shift segment_items dict keys after a segment deletion.

        Args:
            deleted_index: The index of the segment that was deleted
        """
        mw = self.main_window

        if mw.view_mode == "multi":
            # Shift multi-view segment items
            if hasattr(mw, "multi_view_segment_items"):
                for viewer_idx in mw.multi_view_segment_items:
                    new_items = {}
                    for seg_idx, items in mw.multi_view_segment_items[
                        viewer_idx
                    ].items():
                        if seg_idx > deleted_index:
                            new_items[seg_idx - 1] = items
                            # Update segment info on items
                            for item in items:
                                if hasattr(item, "set_segment_info"):
                                    item.set_segment_info(seg_idx - 1, mw)
                        elif seg_idx < deleted_index:
                            new_items[seg_idx] = items
                        # Skip deleted_index entries
                    mw.multi_view_segment_items[viewer_idx] = new_items
        else:
            # Shift single-view segment items
            new_segment_items = {}
            for seg_idx, items in mw.segment_items.items():
                if seg_idx > deleted_index:
                    new_segment_items[seg_idx - 1] = items
                    # Update segment info on items
                    for item in items:
                        if hasattr(item, "set_segment_info"):
                            item.set_segment_info(seg_idx - 1, mw)
                elif seg_idx < deleted_index:
                    new_segment_items[seg_idx] = items
                # Skip deleted_index entries (already removed from scene)
            mw.segment_items = new_segment_items
