from PyQt6.QtWidgets import QTableWidget, QAbstractItemView


class ReorderableClassTable(QTableWidget):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.setDragEnabled(True)
        self.setAcceptDrops(True)
        self.setDropIndicatorShown(True)
        self.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.setDragDropMode(QAbstractItemView.DragDropMode.InternalMove)

    def dropEvent(self, event):
        if not event.isAccepted() and event.source() == self:
            drop_row = self.rowAt(event.position().toPoint().y())
            if drop_row >= 0:
                source_row = self.selectedIndexes()[0].row()

                # If dropping onto the same row, do nothing
                if drop_row == source_row:
                    event.ignore()
                    return

                # Take the source row items
                item = self.takeItem(source_row, 0)

                # Remove the now-empty source row
                self.removeRow(source_row)

                # Insert a new row at the drop position and place the item
                self.insertRow(drop_row)
                self.setItem(drop_row, 0, item)

                event.accept()
        super().dropEvent(event)
