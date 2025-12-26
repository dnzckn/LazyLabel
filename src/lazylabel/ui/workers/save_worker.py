"""Worker thread for async file save operations."""

from PyQt6.QtCore import QThread, pyqtSignal


class SaveWorker(QThread):
    """Worker thread for saving NPZ files in background.

    This prevents UI freezing during save operations, especially for large
    mask tensors or when saving to slow storage.
    """

    finished = pyqtSignal(str)  # Emits the saved file path
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
        save_txt=False,
        save_json=False,
        parent=None,
    ):
        super().__init__(parent)
        self.file_manager = file_manager
        self.image_path = image_path
        self.image_size = image_size
        self.class_order = class_order
        # Shallow copy of list with shallow copy of segment dicts
        # This is safe because save operations only READ segment data, never modify it
        # Masks are numpy arrays which are not mutated during save
        self.segments_snapshot = [seg.copy() for seg in segments_snapshot]
        self.crop_coords = crop_coords
        self.pixel_priority_enabled = pixel_priority_enabled
        self.pixel_priority_ascending = pixel_priority_ascending
        self.save_txt = save_txt
        self.save_json = save_json
        self._should_stop = False

    def stop(self):
        """Request the worker to stop."""
        self._should_stop = True

    def run(self):
        """Run save operation in background thread."""
        try:
            if self._should_stop:
                return

            # Temporarily set the segments on file_manager's segment_manager
            # This is thread-safe since we're using a snapshot
            original_segments = self.file_manager.segment_manager.segments
            self.file_manager.segment_manager.segments = self.segments_snapshot

            try:
                # Save NPZ file
                npz_path = self.file_manager.save_npz(
                    self.image_path,
                    self.image_size,
                    self.class_order,
                    self.crop_coords,
                    self.pixel_priority_enabled,
                    self.pixel_priority_ascending,
                )

                if self._should_stop:
                    return

                # Save TXT if enabled
                if self.save_txt:
                    self.file_manager.save_txt(
                        self.image_path, self.image_size, self.class_order
                    )

                if self._should_stop:
                    return

                # Save JSON if enabled
                if self.save_json:
                    self.file_manager.save_json(self.image_path, self.image_size)

                if not self._should_stop:
                    self.finished.emit(npz_path)

            finally:
                # Restore original segments
                self.file_manager.segment_manager.segments = original_segments

        except Exception as e:
            if not self._should_stop:
                self.error.emit(str(e))
