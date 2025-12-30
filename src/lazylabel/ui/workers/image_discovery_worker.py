"""Worker thread for discovering image files in background."""

import os

from PyQt6.QtCore import QThread, pyqtSignal

# Same extensions as FastFileManager for consistency
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp", ".gif", ".webp"}


class ImageDiscoveryWorker(QThread):
    """Worker thread for discovering all image file paths in background.

    Uses os.scandir() for fast filesystem scanning instead of QFileSystemModel.
    """

    images_discovered = pyqtSignal(list)  # List of all image file paths
    error = pyqtSignal(str)

    def __init__(self, file_model, file_manager, parent=None):
        super().__init__(parent)
        self.file_model = file_model
        self.file_manager = file_manager
        self._should_stop = False

    def stop(self):
        """Request the worker to stop."""
        self._should_stop = True

    def run(self):
        """Discover all image file paths using fast os.scandir()."""
        try:
            if self._should_stop:
                return

            root_path = None
            if hasattr(self.file_model, "rootPath"):
                root_path = self.file_model.rootPath()

            if not root_path or not os.path.isdir(root_path):
                self.images_discovered.emit([])
                return

            all_image_paths = []

            # Use os.scandir() for fast directory scanning
            # This is much faster than QFileSystemModel iteration
            try:
                with os.scandir(root_path) as entries:
                    for entry in entries:
                        if self._should_stop:
                            break

                        # Only process files (not directories for now - single level)
                        if entry.is_file(follow_symlinks=False):
                            ext = os.path.splitext(entry.name)[1].lower()
                            if ext in IMAGE_EXTENSIONS:
                                all_image_paths.append(entry.path)
            except PermissionError:
                pass  # Skip directories we can't access

            if not self._should_stop:
                # Sort for consistent ordering
                self.images_discovered.emit(sorted(all_image_paths))

        except Exception as e:
            if not self._should_stop:
                self.error.emit(f"Error discovering images: {str(e)}")
