from PyQt6.QtWidgets import QTableWidget, QAbstractItemView
from PyQt6.QtCore import Qt


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
                list({index.row() for index in self.selectedIndexes()}), reverse=True
            )

            dragged_items = []
            for row in selected_rows:
                # Take the item from the row and keep its data
                item = self.takeItem(row, 0)
                dragged_items.insert(0, item)
                # Then remove the row itself
                self.removeRow(row)

            # Adjust drop row if it was shifted by the removal
            for row in selected_rows:
                if row < drop_row:
                    drop_row -= 1

            # Insert items at the new location
            for item in dragged_items:
                self.insertRow(drop_row)
                self.setItem(drop_row, 0, item)
                self.selectRow(drop_row)
                drop_row += 1

            event.accept()
        super().dropEvent(event)
