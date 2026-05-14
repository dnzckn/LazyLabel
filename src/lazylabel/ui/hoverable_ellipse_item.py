from PyQt6.QtCore import QRectF
from PyQt6.QtGui import QBrush
from PyQt6.QtWidgets import QGraphicsEllipseItem


class HoverableEllipseItem(QGraphicsEllipseItem):
    """Ellipse item that mirrors HoverablePolygonItem hover/selection behavior.

    Used to render Circle-type segments. Holds a default and hover brush plus
    segment metadata so hover events can sync to mirrored segments in
    multi-view mode.
    """

    def __init__(self, rect: QRectF, parent=None):
        super().__init__(rect, parent)
        self.setAcceptHoverEvents(True)
        self.default_brush = QBrush()
        self.hover_brush = QBrush()
        self.segment_id = None
        self.main_window = None

    def set_brushes(self, default_brush, hover_brush):
        self.default_brush = default_brush
        self.hover_brush = hover_brush
        self.setBrush(self.default_brush)

    def set_segment_info(self, segment_id, main_window):
        self.segment_id = segment_id
        self.main_window = main_window

    def set_hover_state(self, hover_state):
        self.setBrush(self.hover_brush if hover_state else self.default_brush)

    def hoverEnterEvent(self, event):
        self.setBrush(self.hover_brush)
        if (
            self.main_window
            and hasattr(self.main_window, "view_mode")
            and self.main_window.view_mode == "multi"
            and hasattr(self.main_window, "_trigger_segment_hover")
        ):
            self.main_window._trigger_segment_hover(self.segment_id, True, self)
        super().hoverEnterEvent(event)

    def hoverLeaveEvent(self, event):
        self.setBrush(self.default_brush)
        if (
            self.main_window
            and hasattr(self.main_window, "view_mode")
            and self.main_window.view_mode == "multi"
            and hasattr(self.main_window, "_trigger_segment_hover")
        ):
            self.main_window._trigger_segment_hover(self.segment_id, False, self)
        super().hoverLeaveEvent(event)

    def mousePressEvent(self, event):
        pass

    def mouseMoveEvent(self, event):
        pass

    def mouseReleaseEvent(self, event):
        pass

    @staticmethod
    def bounding_rect_from_vertices(vertices) -> QRectF:
        """Compute the ellipse bounding rect from [center, radius_point]."""
        if not vertices or len(vertices) < 2:
            return QRectF()
        cx, cy = float(vertices[0][0]), float(vertices[0][1])
        rx, ry = float(vertices[1][0]), float(vertices[1][1])
        radius = ((rx - cx) ** 2 + (ry - cy) ** 2) ** 0.5
        return QRectF(cx - radius, cy - radius, 2 * radius, 2 * radius)
