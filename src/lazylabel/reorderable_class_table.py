from PyQt6.QtWidgets import QTableWidget, QAbstractItemView
from PyQt6.QtCore import Qt


class ReorderableClassTable(QTableWidget):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.setDragEnabled(True)
        self.setAcceptDrops(True)
        self.setDropIndicatorShown(True)
        self.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
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

            rows = sorted(list({index.row() for index in self.selectedIndexes()}))

            if drop_row >= rows[0] and drop_row <= rows[-1] + 1:
                event.ignore()
                return

            dragged_data = []
            for row in reversed(rows):
                row_data = []
                for col in range(self.columnCount()):
                    row_data.append(self.takeItem(row, col))
                dragged_data.insert(0, row_data)
                self.removeRow(row)

            if drop_row > rows[-1]:
                drop_row -= len(rows)

            for row_data in dragged_data:
                self.insertRow(drop_row)
                for col, item in enumerate(row_data):
                    self.setItem(drop_row, col, item)
                self.selectRow(drop_row)
                drop_row += 1

            event.accept()
        else:
            super().dropEvent(event)
