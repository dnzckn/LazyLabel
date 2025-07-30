"""Worker thread for discovering image files in background."""

from PyQt6.QtCore import QThread, pyqtSignal


class ImageDiscoveryWorker(QThread):
    """Worker thread for discovering all image file paths in background."""

    images_discovered = pyqtSignal(list)  # List of all image file paths
    progress = pyqtSignal(str)  # Progress message
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
        """Discover all image file paths in background."""
        try:
            if self._should_stop:
                return

            self.progress.emit("Scanning for images...")

            if (
                not hasattr(self.file_model, "rootPath")
                or not self.file_model.rootPath()
            ):
                self.images_discovered.emit([])
                return

            all_image_paths = []
            root_index = self.file_model.index(self.file_model.rootPath())

            def scan_directory(parent_index):
                if self._should_stop:
                    return

                for row in range(self.file_model.rowCount(parent_index)):
                    if self._should_stop:
                        return

                    index = self.file_model.index(row, 0, parent_index)
                    if self.file_model.isDir(index):
                        scan_directory(index)  # Recursively scan subdirectories
                    else:
                        path = self.file_model.filePath(index)
                        if self.file_manager.is_image_file(path):
                            # Simply add all image file paths without checking for NPZ
                            all_image_paths.append(path)

            scan_directory(root_index)

            if not self._should_stop:
                self.progress.emit(f"Found {len(all_image_paths)} images")
                self.images_discovered.emit(sorted(all_image_paths))

        except Exception as e:
            if not self._should_stop:
                self.error.emit(f"Error discovering images: {str(e)}")
