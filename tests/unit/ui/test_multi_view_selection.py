"""Unit tests for multi-view selection synchronization.

Tests that selection sync properly selects multiple rows across viewers
and uses QItemSelectionModel correctly.
"""

import pytest
from PyQt6.QtCore import QItemSelectionModel
from PyQt6.QtWidgets import QTableWidget, QTableWidgetItem


@pytest.fixture
def create_table_with_rows(qapp):
    """Factory fixture to create a QTableWidget with specified number of rows."""

    def _create(num_rows: int) -> QTableWidget:
        table = QTableWidget()
        table.setColumnCount(3)
        table.setRowCount(num_rows)
        for row in range(num_rows):
            table.setItem(row, 0, QTableWidgetItem(str(row)))
            table.setItem(row, 1, QTableWidgetItem(f"Segment {row}"))
            table.setItem(row, 2, QTableWidgetItem("100"))
        return table

    return _create


class TestMultiViewSelectionSync:
    """Tests for multi-view selection synchronization."""

    def test_single_row_selection_syncs(self, create_table_with_rows):
        """Test that selecting one row syncs to target table."""
        source_table = create_table_with_rows(3)
        target_table = create_table_with_rows(3)

        # Select row 1 in source
        source_table.selectRow(1)

        # Simulate sync logic
        selected_rows = {item.row() for item in source_table.selectedItems()}
        assert selected_rows == {1}

        # Apply to target using proper selection model
        target_table.clearSelection()
        selection_model = target_table.selectionModel()
        for row in selected_rows:
            index = target_table.model().index(row, 0)
            selection_model.select(
                index,
                QItemSelectionModel.SelectionFlag.Select
                | QItemSelectionModel.SelectionFlag.Rows,
            )

        # Verify target has same selection
        target_selected = {item.row() for item in target_table.selectedItems()}
        assert target_selected == {1}

    def test_multiple_row_selection_syncs_all_rows(self, create_table_with_rows):
        """Test that selecting multiple rows syncs ALL rows to target."""
        source_table = create_table_with_rows(4)
        target_table = create_table_with_rows(4)

        # Select rows 0, 1, 2 in source using selection model
        source_model = source_table.selectionModel()
        for row in [0, 1, 2]:
            index = source_table.model().index(row, 0)
            source_model.select(
                index,
                QItemSelectionModel.SelectionFlag.Select
                | QItemSelectionModel.SelectionFlag.Rows,
            )

        # Get selected rows
        selected_rows = {item.row() for item in source_table.selectedItems()}
        assert selected_rows == {0, 1, 2}, "Source should have 3 rows selected"

        # Apply to target using proper selection model (the fix)
        target_table.clearSelection()
        target_model = target_table.selectionModel()
        for row in selected_rows:
            index = target_table.model().index(row, 0)
            target_model.select(
                index,
                QItemSelectionModel.SelectionFlag.Select
                | QItemSelectionModel.SelectionFlag.Rows,
            )

        # Verify ALL rows synced
        target_selected = {item.row() for item in target_table.selectedItems()}
        assert target_selected == {0, 1, 2}, "Target should have all 3 rows selected"

    def test_select_row_method_clears_previous_selection(self, create_table_with_rows):
        """Demonstrate that selectRow() clears previous selection (the bug)."""
        table = create_table_with_rows(3)

        # This is the OLD buggy approach - selectRow clears previous
        table.selectRow(0)
        table.selectRow(1)
        table.selectRow(2)

        # Only last row should be selected (bug behavior)
        selected_rows = {item.row() for item in table.selectedItems()}
        assert selected_rows == {2}, "selectRow() only keeps last selection"

    def test_selection_model_accumulates_selections(self, create_table_with_rows):
        """Demonstrate that QItemSelectionModel.select() accumulates (the fix)."""
        table = create_table_with_rows(3)

        # This is the FIXED approach - use selection model with Select flag
        selection_model = table.selectionModel()
        for row in [0, 1, 2]:
            index = table.model().index(row, 0)
            selection_model.select(
                index,
                QItemSelectionModel.SelectionFlag.Select
                | QItemSelectionModel.SelectionFlag.Rows,
            )

        # All rows should be selected
        selected_rows = {item.row() for item in table.selectedItems()}
        assert selected_rows == {0, 1, 2}, "Selection model keeps all selections"

    def test_sync_handles_mismatched_row_counts(self, create_table_with_rows):
        """Test sync when target has fewer rows than source selection."""
        source_table = create_table_with_rows(5)
        target_table = create_table_with_rows(3)  # Fewer rows

        # Select rows 0, 2, 4 in source
        source_model = source_table.selectionModel()
        for row in [0, 2, 4]:
            index = source_table.model().index(row, 0)
            source_model.select(
                index,
                QItemSelectionModel.SelectionFlag.Select
                | QItemSelectionModel.SelectionFlag.Rows,
            )

        selected_rows = {item.row() for item in source_table.selectedItems()}

        # Apply to target, skipping rows that don't exist
        target_table.clearSelection()
        target_model = target_table.selectionModel()
        for row in selected_rows:
            if row < target_table.rowCount():  # Guard for target size
                index = target_table.model().index(row, 0)
                target_model.select(
                    index,
                    QItemSelectionModel.SelectionFlag.Select
                    | QItemSelectionModel.SelectionFlag.Rows,
                )

        # Only rows 0 and 2 should be selected (row 4 doesn't exist in target)
        target_selected = {item.row() for item in target_table.selectedItems()}
        assert target_selected == {0, 2}

    def test_clear_selection_before_sync(self, create_table_with_rows):
        """Test that target selection is cleared before syncing."""
        source_table = create_table_with_rows(3)
        target_table = create_table_with_rows(3)

        # Pre-select row 2 in target
        target_table.selectRow(2)
        pre_selected = {item.row() for item in target_table.selectedItems()}
        assert 2 in pre_selected

        # Select only row 0 in source
        source_table.selectRow(0)
        selected_rows = {item.row() for item in source_table.selectedItems()}

        # Clear and sync
        target_table.clearSelection()
        target_model = target_table.selectionModel()
        for row in selected_rows:
            index = target_table.model().index(row, 0)
            target_model.select(
                index,
                QItemSelectionModel.SelectionFlag.Select
                | QItemSelectionModel.SelectionFlag.Rows,
            )

        # Only row 0 should be selected (row 2 was cleared)
        target_selected = {item.row() for item in target_table.selectedItems()}
        assert target_selected == {0}
        assert 2 not in target_selected
