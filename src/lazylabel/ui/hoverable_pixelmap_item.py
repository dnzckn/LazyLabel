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
        from lazylabel.utils.logger import logger

        self.default_pixmap = default_pixmap
        self.hover_pixmap = hover_pixmap
        self.setPixmap(self.default_pixmap)
        logger.debug(
            f"HoverablePixmapItem.set_pixmaps: default={default_pixmap}, hover={hover_pixmap}"
        )

    def set_segment_info(self, segment_id, main_window):
        from lazylabel.utils.logger import logger

        self.segment_id = segment_id
        self.main_window = main_window
        logger.debug(
            f"HoverablePixmapItem.set_segment_info: segment_id={segment_id}, main_window={main_window is not None}"
        )

    def hoverEnterEvent(self, event):
        from lazylabel.utils.logger import logger

        logger.debug(
            f"HoverablePixmapItem.hoverEnterEvent: segment_id={self.segment_id}, main_window={self.main_window is not None}"
        )
        self.setPixmap(self.hover_pixmap)
        # Trigger hover on mirror segments in multi-view mode
        if self.main_window:
            if hasattr(self.main_window, "view_mode"):
                logger.debug(f"View mode check: view_mode={self.main_window.view_mode}")
                if self.main_window.view_mode == "multi":
                    logger.debug(
                        f"Triggering segment hover: segment_id={self.segment_id}"
                    )
                    self.main_window._trigger_segment_hover(self.segment_id, True, self)
            else:
                logger.debug("main_window has no view_mode attribute!")
        super().hoverEnterEvent(event)

    def hoverLeaveEvent(self, event):
        from lazylabel.utils.logger import logger

        logger.debug(
            f"HoverablePixmapItem.hoverLeaveEvent: segment_id={self.segment_id}, main_window={self.main_window is not None}"
        )
        self.setPixmap(self.default_pixmap)
        # Trigger unhover on mirror segments in multi-view mode
        if (
            self.main_window
            and hasattr(self.main_window, "view_mode")
            and self.main_window.view_mode == "multi"
        ):
            logger.debug(f"Triggering segment unhover: segment_id={self.segment_id}")
            self.main_window._trigger_segment_hover(self.segment_id, False, self)
        super().hoverLeaveEvent(event)
