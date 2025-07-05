from PyQt6.QtWidgets import QAbstractItemView, QTableWidget


class ReorderableClassTable(QTableWidget):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.setDragEnabled(True)
        self.setAcceptDrops(True)
        self.setDropIndicatorShown(True)
        self.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.setSelectionMode(QAbstractItemView.SelectionMode.ExtendedSelection)
        self.setDragDropMode(QAbstractItemView.DragDropMode.InternalMove)
        self.scroll_margin = 40

    def dragMoveEvent(self, event):
        pos = event.position().toPoint()
        rect = self.viewport().rect()

        if pos.y() < rect.top() + self.scroll_margin:
            self.verticalScrollBar().setValue(self.verticalScrollBar().value() - 1)
        elif pos.y() > rect.bottom() - self.scroll_margin:
            self.verticalScrollBar().setValue(self.verticalScrollBar().value() + 1)

        super().dragMoveEvent(event)

    def dropEvent(self, event):
        if not event.isAccepted() and event.source() == self:
            drop_row = self.rowAt(event.position().toPoint().y())
            if drop_row < 0:
                drop_row = self.rowCount()

            selected_rows = sorted(
                {index.row() for index in self.selectedIndexes()}, reverse=True
            )

            dragged_rows_data = []
            for row in selected_rows:
                # Take all items from the row
                row_data = [
                    self.takeItem(row, col) for col in range(self.columnCount())
                ]
                dragged_rows_data.insert(0, row_data)
                # Then remove the row itself
                self.removeRow(row)

            # Adjust drop row if it was shifted by the removal
            for row in selected_rows:
                if row < drop_row:
                    drop_row -= 1

            # Insert rows and their items at the new location
            for row_data in dragged_rows_data:
                self.insertRow(drop_row)
                for col, item in enumerate(row_data):
                    self.setItem(drop_row, col, item)
                self.selectRow(drop_row)
                drop_row += 1

            event.accept()
        super().dropEvent(event)
