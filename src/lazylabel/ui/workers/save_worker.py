"""Worker thread for async file save operations."""

from PyQt6.QtCore import QThread, pyqtSignal

from ...core.exporters import ExportContext, ExportFormat, export_all


class SaveWorker(QThread):
    """Worker thread for saving annotation files in background.

    This prevents UI freezing during save operations, especially for large
    mask tensors or when saving to slow storage.
    """

    finished = pyqtSignal(str)  # Emits the first saved file path
    error = pyqtSignal(str)  # Emits error message

    def __init__(
        self,
        file_manager,
        image_path,
        image_size,
        class_order,
        segments_snapshot,
        crop_coords=None,
        pixel_priority_enabled=False,
        pixel_priority_ascending=True,
        export_formats=None,
        parent=None,
    ):
        super().__init__(parent)
        self.file_manager = file_manager
        self.image_path = image_path
        self.image_size = image_size
        self.class_order = class_order
        self.segments_snapshot = [seg.copy() for seg in segments_snapshot]
        self.crop_coords = crop_coords
        self.pixel_priority_enabled = pixel_priority_enabled
        self.pixel_priority_ascending = pixel_priority_ascending
        self.export_formats = export_formats or {ExportFormat.NPZ}
        self._should_stop = False

    def stop(self):
        """Request the worker to stop."""
        self._should_stop = True

    def run(self):
        """Run save operation in background thread."""
        try:
            if self._should_stop:
                return

            original_segments = self.file_manager.segment_manager.segments
            self.file_manager.segment_manager.segments = self.segments_snapshot

            try:
                class_labels = [
                    self.file_manager.segment_manager.get_class_alias(cid)
                    for cid in self.class_order
                ]

                mask_tensor = (
                    self.file_manager.segment_manager.create_final_mask_tensor(
                        self.image_size,
                        self.class_order,
                        self.pixel_priority_enabled,
                        self.pixel_priority_ascending,
                    )
                )

                if self.crop_coords:
                    mask_tensor = self.file_manager._apply_crop_to_mask(
                        mask_tensor, self.crop_coords
                    )

                if self._should_stop:
                    return

                ctx = ExportContext(
                    image_path=self.image_path,
                    image_size=self.image_size,
                    class_order=self.class_order,
                    class_labels=class_labels,
                    class_aliases=dict(self.file_manager.segment_manager.class_aliases),
                    mask_tensor=mask_tensor,
                    crop_coords=self.crop_coords,
                )

                written = export_all(self.export_formats, ctx)

                if not self._should_stop and written:
                    self.finished.emit(written[0])

            finally:
                self.file_manager.segment_manager.segments = original_segments

        except Exception as e:
            if not self._should_stop:
                self.error.emit(str(e))
