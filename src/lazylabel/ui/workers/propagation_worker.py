"""Worker threads for SAM 2 video propagation in background."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

import numpy as np
from PyQt6.QtCore import QThread, pyqtSignal

from ...utils.logger import logger
from ..managers.propagation_manager import PropagationDirection

if TYPE_CHECKING:
    from ..managers.propagation_manager import PropagationManager


class PropagationWorker(QThread):
    """Worker thread for running SAM 2 mask propagation in background.

    This worker handles the actual propagation execution, emitting
    signals for progress updates and results that the UI can handle.
    """

    # Signals
    progress = pyqtSignal(int, int)  # current_frame, total_frames
    frame_done = pyqtSignal(int, object)  # frame_idx, PropagationResult
    finished_propagation = pyqtSignal()
    error = pyqtSignal(str)

    def __init__(
        self,
        propagation_manager: PropagationManager,
        direction: PropagationDirection,
        range_start: int | None = None,
        range_end: int | None = None,
        skip_flagged: bool = True,
        parent=None,
    ):
        """Initialize the propagation worker.

        Args:
            propagation_manager: The propagation manager to use
            direction: Direction to propagate (forward/backward/bidirectional)
            range_start: Optional start frame index
            range_end: Optional end frame index
            skip_flagged: If True, don't create masks for low confidence frames
            parent: Parent QObject
        """
        super().__init__(parent)
        self.propagation_manager = propagation_manager
        self.direction = direction
        self.range_start = range_start
        self.range_end = range_end
        self.skip_flagged = skip_flagged
        self._should_stop = False

    def stop(self) -> None:
        """Request the worker to stop."""
        self._should_stop = True
        # Also tell the propagation manager to cancel
        self.propagation_manager.request_cancel()

    def run(self) -> None:
        """Run propagation in background thread."""
        try:
            if self._should_stop:
                return

            logger.info(
                f"PropagationWorker: Starting {self.direction.value} propagation"
            )

            processed_results = 0
            processed_frames = set()  # Track unique frames for progress

            # Run propagation - this is a generator (yields per object, not per frame)
            for frame_idx, total, result in self.propagation_manager.propagate(
                direction=self.direction,
                range_start=self.range_start,
                range_end=self.range_end,
                skip_flagged=self.skip_flagged,
            ):
                if self._should_stop:
                    logger.info("PropagationWorker: Stopped by request")
                    return

                processed_results += 1
                processed_frames.add(frame_idx)

                # Emit progress based on unique frames processed
                self.progress.emit(len(processed_frames), total)

                # Emit result for this frame/object
                self.frame_done.emit(frame_idx, result)

            if not self._should_stop:
                logger.info(
                    f"PropagationWorker: Completed, processed {processed_results} results "
                    f"across {len(processed_frames)} frames"
                )
                self.finished_propagation.emit()

        except Exception as e:
            logger.error(f"PropagationWorker: Error during propagation: {e}")
            if not self._should_stop:
                self.error.emit(str(e))


class SequenceInitWorker(QThread):
    """Worker thread for initializing SAM 2 video state in background.

    This worker handles the initialization of the video predictor
    with an image sequence, which can take time for large folders.
    """

    # Signals
    progress = pyqtSignal(str)  # status message
    finished_init = pyqtSignal(bool)  # success
    error = pyqtSignal(str)

    def __init__(
        self,
        propagation_manager: PropagationManager,
        image_paths: list[str],
        image_cache: dict | None = None,
        reference_dimensions: tuple[int, int] | None = None,
        parent=None,
    ):
        """Initialize the sequence init worker.

        Args:
            propagation_manager: The propagation manager to use
            image_paths: List of image file paths for the sequence
            image_cache: Optional dict mapping image paths to numpy arrays
            reference_dimensions: Optional (height, width) for filtering
                images with mismatched dimensions
            parent: Parent QObject
        """
        super().__init__(parent)
        self.propagation_manager = propagation_manager
        self.image_paths = image_paths
        self.image_cache = image_cache
        self.reference_dimensions = reference_dimensions
        self._should_stop = False

    def stop(self) -> None:
        """Request the worker to stop."""
        self._should_stop = True

    def _on_progress(self, current: int, total: int, message: str) -> None:
        """Callback for per-image progress from init_video_state."""
        self.progress.emit(message)

    def run(self) -> None:
        """Run sequence initialization in background thread."""
        try:
            if self._should_stop:
                return

            self.progress.emit("Preparing images...")

            if self._should_stop:
                return

            # Initialize the sequence with per-image progress callback
            success = self.propagation_manager.init_sequence(
                self.image_paths,
                reference_dimensions=self.reference_dimensions,
                image_cache=self.image_cache,
                progress_callback=self._on_progress,
            )

            if self._should_stop:
                return

            if success:
                frame_count = self.propagation_manager.total_frames
                self.progress.emit(f"Initialized with {frame_count} frames")
                logger.info(
                    f"SequenceInitWorker: Initialized with {frame_count} frames"
                )
            else:
                self.progress.emit("Failed to initialize")
                logger.error("SequenceInitWorker: Failed to initialize")

            self.finished_init.emit(success)

        except Exception as e:
            logger.error(f"SequenceInitWorker: Error during initialization: {e}")
            if not self._should_stop:
                self.error.emit(str(e))


@dataclass
class ReferenceSegmentData:
    """Pre-collected reference segment data for background annotation."""

    frame_idx: int
    mask: np.ndarray
    class_id: int
    class_name: str
    obj_id: int


class ReferenceAnnotationWorker(QThread):
    """Worker thread for adding reference annotations to SAM 2 in background.

    This worker takes pre-collected reference data and adds the annotations
    to the propagation manager on a background thread, avoiding GUI freezes
    for large masks or many reference frames.
    """

    # Signals
    progress = pyqtSignal(str)  # status message
    finished_annotations = pyqtSignal(int)  # total annotations added
    error = pyqtSignal(str)

    def __init__(
        self,
        propagation_manager: PropagationManager,
        reference_frames: list[int],
        segments: list[ReferenceSegmentData],
        parent=None,
    ):
        """Initialize the reference annotation worker.

        Args:
            propagation_manager: The propagation manager to use
            reference_frames: List of reference frame indices to register
            segments: Pre-collected segment data for all reference frames
            parent: Parent QObject
        """
        super().__init__(parent)
        self.propagation_manager = propagation_manager
        self.reference_frames = reference_frames
        self.segments = segments
        self._should_stop = False

    def stop(self) -> None:
        """Request the worker to stop."""
        self._should_stop = True

    def run(self) -> None:
        """Add reference annotations in background thread."""
        try:
            # Register reference frames
            for ref_idx in self.reference_frames:
                if self._should_stop:
                    return
                self.propagation_manager.add_reference_frame(ref_idx)

            # Add annotations, tracking progress per reference frame
            total_count = 0
            total_frames = len(self.reference_frames)
            processed_frames: set[int] = set()
            for seg in self.segments:
                if self._should_stop:
                    return

                result_id = self.propagation_manager.add_reference_annotation(
                    seg.frame_idx,
                    seg.mask,
                    seg.class_id,
                    seg.class_name,
                    obj_id=seg.obj_id,
                )
                if result_id > 0:
                    total_count += 1

                if seg.frame_idx not in processed_frames:
                    processed_frames.add(seg.frame_idx)
                    self.progress.emit(
                        f"Adding reference {len(processed_frames)}/{total_frames}"
                    )

            self.finished_annotations.emit(total_count)

        except Exception as e:
            logger.error(f"ReferenceAnnotationWorker: Error adding annotations: {e}")
            if not self._should_stop:
                self.error.emit(str(e))


class PropagationSaveWorker(QThread):
    """Worker thread for saving propagation results to disk.

    This worker handles saving propagated masks as segments,
    running in the background to avoid blocking the UI.
    """

    # Signals
    progress = pyqtSignal(int, int)  # current, total
    finished_save = pyqtSignal(int)  # num_saved
    error = pyqtSignal(str)

    def __init__(
        self,
        propagation_manager: PropagationManager,
        save_callback,  # Callable that takes (frame_idx, results) and saves
        frames_to_save: list[int] | None = None,
        parent=None,
    ):
        """Initialize the save worker.

        Args:
            propagation_manager: The propagation manager with results
            save_callback: Function to call for saving each frame
            frames_to_save: Optional list of specific frames to save (None = all)
            parent: Parent QObject
        """
        super().__init__(parent)
        self.propagation_manager = propagation_manager
        self.save_callback = save_callback
        self.frames_to_save = frames_to_save
        self._should_stop = False

    def stop(self) -> None:
        """Request the worker to stop."""
        self._should_stop = True

    def run(self) -> None:
        """Run save operation in background thread."""
        try:
            if self._should_stop:
                return

            # Determine which frames to save
            frames = self.frames_to_save
            if frames is None:
                frames = sorted(self.propagation_manager.propagated_frames)

            total = len(frames)
            saved = 0

            for i, frame_idx in enumerate(frames):
                if self._should_stop:
                    logger.info("PropagationSaveWorker: Stopped by request")
                    break

                results = self.propagation_manager.get_frame_results(frame_idx)
                if results:
                    try:
                        self.save_callback(frame_idx, results)
                        saved += 1
                    except Exception as e:
                        logger.error(
                            f"PropagationSaveWorker: Error saving frame {frame_idx}: {e}"
                        )

                self.progress.emit(i + 1, total)

            if not self._should_stop:
                logger.info(f"PropagationSaveWorker: Saved {saved}/{total} frames")
                self.finished_save.emit(saved)

        except Exception as e:
            logger.error(f"PropagationSaveWorker: Error during save: {e}")
            if not self._should_stop:
                self.error.emit(str(e))
