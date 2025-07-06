from PyQt6.QtGui import QBrush, QPolygonF
from PyQt6.QtWidgets import QGraphicsPolygonItem


class HoverablePolygonItem(QGraphicsPolygonItem):
    def __init__(self, polygon, parent=None):
        super().__init__(polygon, parent)
        self.setAcceptHoverEvents(True)
        self.default_brush = QBrush()
        self.hover_brush = QBrush()
        self.segment_id = None
        self.main_window = None

    def set_brushes(self, default_brush, hover_brush):
        from lazylabel.utils.logger import logger
        self.default_brush = default_brush
        self.hover_brush = hover_brush
        self.setBrush(self.default_brush)
        logger.debug(f"HoverablePolygonItem.set_brushes: default={default_brush}, hover={hover_brush}")

    def set_segment_info(self, segment_id, main_window):
        from lazylabel.utils.logger import logger
        self.segment_id = segment_id
        self.main_window = main_window
        logger.debug(f"HoverablePolygonItem.set_segment_info: segment_id={segment_id}, main_window={main_window is not None}")

    def hoverEnterEvent(self, event):
        from lazylabel.utils.logger import logger
        logger.debug(f"HoverablePolygonItem.hoverEnterEvent: segment_id={self.segment_id}, main_window={self.main_window is not None}")
        self.setBrush(self.hover_brush)
        # Trigger hover on mirror segments in multi-view mode
        if self.main_window and hasattr(self.main_window, 'view_mode') and self.main_window.view_mode == "multi":
            logger.debug(f"Triggering segment hover: segment_id={self.segment_id}, view_mode={self.main_window.view_mode}")
            self.main_window._trigger_segment_hover(self.segment_id, True, self)
        super().hoverEnterEvent(event)

    def hoverLeaveEvent(self, event):
        from lazylabel.utils.logger import logger
        logger.debug(f"HoverablePolygonItem.hoverLeaveEvent: segment_id={self.segment_id}, main_window={self.main_window is not None}")
        self.setBrush(self.default_brush)
        # Trigger unhover on mirror segments in multi-view mode
        if self.main_window and hasattr(self.main_window, 'view_mode') and self.main_window.view_mode == "multi":
            logger.debug(f"Triggering segment unhover: segment_id={self.segment_id}, view_mode={self.main_window.view_mode}")
            self.main_window._trigger_segment_hover(self.segment_id, False, self)
        super().hoverLeaveEvent(event)

    def mousePressEvent(self, event):
        # Remove mouse events as per the new instructions
        pass

    def mouseMoveEvent(self, event):
        # Remove mouse events as per the new instructions
        pass

    def mouseReleaseEvent(self, event):
        # Remove mouse events as per the new instructions
        pass

    def setPolygonVertices(self, vertices):
        self.setPolygon(QPolygonF(vertices))
