from PyQt6.QtWidgets import QGraphicsPixmapItem


class HoverablePixmapItem(QGraphicsPixmapItem):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAcceptHoverEvents(True)
        self.default_pixmap = None
        self.hover_pixmap = None
        self.segment_id = None
        self.main_window = None

    def set_pixmaps(self, default_pixmap, hover_pixmap):
        self.default_pixmap = default_pixmap
        self.hover_pixmap = hover_pixmap
        self.setPixmap(self.default_pixmap)

    def set_segment_info(self, segment_id, main_window):
        self.segment_id = segment_id
        self.main_window = main_window

    def set_hover_state(self, hover_state):
        """Set hover state without triggering hover events."""
        self.setPixmap(self.hover_pixmap if hover_state else self.default_pixmap)

    def hoverEnterEvent(self, event):
        self.setPixmap(self.hover_pixmap)
        # Trigger hover on mirror segments in multi-view mode
        if (
            self.main_window
            and hasattr(self.main_window, "view_mode")
            and self.main_window.view_mode == "multi"
            and hasattr(self.main_window, "_trigger_segment_hover")
        ):
            self.main_window._trigger_segment_hover(self.segment_id, True, self)
        super().hoverEnterEvent(event)

    def hoverLeaveEvent(self, event):
        self.setPixmap(self.default_pixmap)
        # Trigger unhover on mirror segments in multi-view mode
        if (
            self.main_window
            and hasattr(self.main_window, "view_mode")
            and self.main_window.view_mode == "multi"
        ):
            self.main_window._trigger_segment_hover(self.segment_id, False, self)
        super().hoverLeaveEvent(event)
