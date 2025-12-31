"""Propagation manager for SAM 2 video-based mask propagation.

This manager handles:
- Video state initialization for image sequences
- Reference frame annotation management
- Forward/backward propagation execution
- Confidence scoring and frame flagging
- Progress tracking for UI updates
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

from ...utils.logger import logger

if TYPE_CHECKING:
    from ...core.segment_manager import SegmentManager
    from ...models.sam2_model import Sam2Model
    from ..main_window import MainWindow


class PropagationDirection(Enum):
    """Direction for mask propagation."""

    FORWARD = "forward"
    BACKWARD = "backward"
    BIDIRECTIONAL = "bidirectional"


class FrameStatus(Enum):
    """Status of a frame in the sequence."""

    PENDING = "pending"
    REFERENCE = "reference"
    PROPAGATED = "propagated"
    FLAGGED = "flagged"


@dataclass
class PropagationResult:
    """Result of propagation for a single frame."""

    frame_idx: int
    obj_id: int
    mask: np.ndarray
    confidence: float
    image_path: str


@dataclass
class ReferenceAnnotation:
    """Reference annotation for propagation."""

    frame_idx: int
    obj_id: int
    mask: np.ndarray
    class_id: int
    class_name: str


@dataclass
class PropagationState:
    """State of the propagation process."""

    is_initialized: bool = False
    image_dir: str | None = None
    total_frames: int = 0
    reference_frame_indices: set[int] = field(
        default_factory=set
    )  # Multiple reference frames
    reference_annotations: list[ReferenceAnnotation] = field(default_factory=list)
    propagated_frames: set[int] = field(default_factory=set)
    flagged_frames: set[int] = field(default_factory=set)
    frame_results: dict[int, list[PropagationResult]] = field(default_factory=dict)
    confidence_threshold: float = 0.95


class PropagationManager:
    """Manages SAM 2 video predictor for sequence mask propagation.

    This class provides a high-level facade for SAM 2 video propagation,
    handling state management, reference annotations, and result tracking.
    """

    def __init__(self, main_window: MainWindow):
        """Initialize the propagation manager.

        Args:
            main_window: Parent MainWindow instance
        """
        self.mw = main_window
        self.state = PropagationState()
        self._cancel_requested = False

    # ========== Property Accessors ==========

    @property
    def sam2_model(self) -> Sam2Model | None:
        """Get SAM 2 model from main window.

        Note: The model_manager stores SAM2 models in the sam_model attribute,
        not sam2_model. This property provides convenient access for propagation.
        """
        if hasattr(self.mw, "model_manager"):
            return self.mw.model_manager.sam_model
        return None

    @property
    def segment_manager(self) -> SegmentManager:
        """Get segment manager from main window."""
        return self.mw.segment_manager

    @property
    def is_initialized(self) -> bool:
        """Check if video state is initialized."""
        return self.state.is_initialized

    @property
    def total_frames(self) -> int:
        """Get total number of frames in sequence."""
        return self.state.total_frames

    @property
    def reference_frame_indices(self) -> set[int]:
        """Get set of reference frame indices."""
        return self.state.reference_frame_indices

    @property
    def primary_reference_idx(self) -> int:
        """Get the primary (lowest index) reference frame, or -1 if none."""
        if self.state.reference_frame_indices:
            return min(self.state.reference_frame_indices)
        return -1

    @property
    def propagated_frames(self) -> set[int]:
        """Get set of propagated frame indices."""
        return self.state.propagated_frames

    @property
    def flagged_frames(self) -> set[int]:
        """Get set of flagged (low confidence) frame indices."""
        return self.state.flagged_frames

    # ========== Initialization ==========

    def init_sequence(self, image_dir: str) -> bool:
        """Initialize the video predictor with an image sequence.

        Args:
            image_dir: Path to directory containing image sequence

        Returns:
            True if successful, False otherwise
        """
        if self.sam2_model is None:
            logger.error("PropagationManager: SAM 2 model not available")
            return False

        # Check if video predictor is available
        if not hasattr(self.sam2_model, "init_video_state"):
            logger.error("PropagationManager: SAM 2 video predictor not available")
            return False

        # Initialize video state
        if not self.sam2_model.init_video_state(image_dir):
            logger.error("PropagationManager: Failed to initialize video state")
            return False

        # Reset propagation state
        self.state = PropagationState(
            is_initialized=True,
            image_dir=image_dir,
            total_frames=self.sam2_model.video_frame_count,
            confidence_threshold=0.95,
        )

        logger.info(
            f"PropagationManager: Initialized with {self.state.total_frames} frames"
        )
        return True

    def cleanup(self) -> None:
        """Clean up video predictor and reset state."""
        if self.sam2_model is not None and hasattr(
            self.sam2_model, "cleanup_video_predictor"
        ):
            self.sam2_model.cleanup_video_predictor()

        self.state = PropagationState()
        self._cancel_requested = False
        logger.info("PropagationManager: Cleaned up")

    # ========== Reference Frame Management ==========

    def add_reference_frame(self, frame_idx: int) -> bool:
        """Add a frame to the reference set.

        Args:
            frame_idx: Index of the reference frame (0-based)

        Returns:
            True if successful
        """
        if not self.is_initialized:
            logger.error("PropagationManager: Not initialized")
            return False

        if frame_idx < 0 or frame_idx >= self.state.total_frames:
            logger.error(f"PropagationManager: Invalid frame index {frame_idx}")
            return False

        self.state.reference_frame_indices.add(frame_idx)
        logger.info(f"PropagationManager: Added reference frame {frame_idx}")
        return True

    def add_reference_frames(self, frame_indices: list[int]) -> int:
        """Add multiple frames to the reference set.

        Args:
            frame_indices: List of frame indices to add

        Returns:
            Number of frames successfully added
        """
        if not self.is_initialized:
            logger.error("PropagationManager: Not initialized")
            return 0

        count = 0
        for idx in frame_indices:
            if 0 <= idx < self.state.total_frames:
                self.state.reference_frame_indices.add(idx)
                count += 1

        logger.info(f"PropagationManager: Added {count} reference frames")
        return count

    def clear_reference_frames(self) -> None:
        """Clear all reference frames."""
        self.state.reference_frame_indices.clear()
        self.clear_reference_annotations()
        logger.info("PropagationManager: Cleared all reference frames")

    def add_reference_annotation(
        self,
        frame_idx: int,
        mask: np.ndarray,
        class_id: int,
        class_name: str,
        obj_id: int | None = None,
    ) -> int:
        """Add a reference annotation for propagation.

        Args:
            frame_idx: Frame index where the annotation is located
            mask: Binary mask array (H, W)
            class_id: Class ID for the annotation
            class_name: Class name for the annotation
            obj_id: Optional specific object ID (auto-assigned if None)

        Returns:
            Object ID assigned to this annotation
        """
        if not self.is_initialized:
            logger.error("PropagationManager: Not initialized")
            return -1

        # Ensure the frame is marked as a reference (in case add_reference_frame wasn't called)
        self.state.reference_frame_indices.add(frame_idx)

        # Auto-assign object ID if not provided
        if obj_id is None:
            existing_ids = {ann.obj_id for ann in self.state.reference_annotations}
            obj_id = max(existing_ids, default=0) + 1

        annotation = ReferenceAnnotation(
            frame_idx=frame_idx,
            obj_id=obj_id,
            mask=mask.copy(),
            class_id=class_id,
            class_name=class_name,
        )
        self.state.reference_annotations.append(annotation)

        # Add mask to SAM 2 video predictor
        if self.sam2_model is not None:
            result = self.sam2_model.add_video_mask(
                frame_idx=frame_idx,
                obj_id=obj_id,
                mask=mask,
            )
            if result is not None:
                logger.info(
                    f"PropagationManager: Added reference annotation obj_id={obj_id}, "
                    f"class={class_name}, confidence={result[1]:.2f}"
                )

        return obj_id

    def add_reference_annotations_from_segments(self, frame_idx: int) -> int:
        """Add all current segments as reference annotations for a frame.

        Args:
            frame_idx: Frame index where the segments are located

        Returns:
            Number of annotations added
        """
        if not self.is_initialized:
            logger.error("PropagationManager: Not initialized")
            return 0

        # Clear existing annotations and previous propagation results
        self.state.reference_annotations.clear()
        self.clear_propagation_results()

        # Reset video state to clear old prompts
        if self.sam2_model is not None:
            self.sam2_model.reset_video_state()

        # Get all segments from segment manager (segments is a list of dicts)
        count = 0
        for segment in self.segment_manager.segments:
            mask = segment.get("mask")
            if mask is not None and mask.any():
                class_id = segment.get("class_id", 0)
                # Get class name from aliases or use default
                class_name = self.segment_manager.class_aliases.get(
                    class_id, f"Class {class_id}"
                )
                obj_id = self.add_reference_annotation(
                    frame_idx=frame_idx,
                    mask=mask,
                    class_id=class_id,
                    class_name=class_name,
                )
                if obj_id > 0:
                    count += 1

        logger.info(
            f"PropagationManager: Added {count} reference annotations for frame {frame_idx}"
        )
        return count

    def clear_reference_annotations(self) -> None:
        """Clear all reference annotations."""
        self.state.reference_annotations.clear()
        if self.sam2_model is not None:
            self.sam2_model.reset_video_state()
        logger.info("PropagationManager: Cleared reference annotations")

    def clear_propagation_results(self) -> None:
        """Clear all propagation results from previous runs.

        This should be called before starting a new propagation to ensure
        old results don't persist and get mixed with new ones.
        """
        self.state.frame_results.clear()
        self.state.propagated_frames.clear()
        self.state.flagged_frames.clear()
        logger.info("PropagationManager: Cleared propagation results")

    # ========== Propagation Execution ==========

    def request_cancel(self) -> None:
        """Request cancellation of ongoing propagation."""
        self._cancel_requested = True
        logger.info("PropagationManager: Cancellation requested")

    def propagate(
        self,
        direction: PropagationDirection,
        range_start: int | None = None,
        range_end: int | None = None,
        skip_flagged: bool = True,
    ):
        """Propagate masks through the sequence.

        This is a generator that yields progress updates and results.

        Args:
            direction: Direction to propagate (forward/backward/bidirectional)
            range_start: Optional start frame (default: 0 or reference)
            range_end: Optional end frame (default: last frame)
            skip_flagged: If True, don't store results for low confidence frames

        Yields:
            Tuple of (current_frame, total_frames, results_for_frame)
        """
        if not self.is_initialized:
            logger.error("PropagationManager: Not initialized")
            return

        if not self.state.reference_annotations:
            logger.error("PropagationManager: No reference annotations")
            return

        if self.sam2_model is None:
            logger.error("PropagationManager: SAM 2 model not available")
            return

        self._cancel_requested = False

        # Determine range based on direction
        # Use primary (min) reference for forward, max for backward
        ref_indices = self.state.reference_frame_indices
        min_ref = min(ref_indices) if ref_indices else 0
        max_ref = max(ref_indices) if ref_indices else 0

        if direction == PropagationDirection.FORWARD:
            start = range_start if range_start is not None else min_ref
            end = range_end if range_end is not None else self.state.total_frames - 1
            yield from self._propagate_range(
                start, end, reverse=False, skip_flagged=skip_flagged
            )

        elif direction == PropagationDirection.BACKWARD:
            start = range_start if range_start is not None else 0
            end = range_end if range_end is not None else max_ref
            yield from self._propagate_range(
                end, start, reverse=True, skip_flagged=skip_flagged
            )

        elif direction == PropagationDirection.BIDIRECTIONAL:
            # Propagate forward from min reference to end
            # Starting from min_ref ensures SAM2 properly propagates through all frames
            end = range_end if range_end is not None else self.state.total_frames - 1
            yield from self._propagate_range(
                min_ref, end, reverse=False, skip_flagged=skip_flagged
            )

            if self._cancel_requested:
                return

            # Then propagate backward from min reference to start (if min_ref > range_start)
            start = range_start if range_start is not None else 0
            if min_ref > start:
                yield from self._propagate_range(
                    min_ref, start, reverse=True, skip_flagged=skip_flagged
                )

    def _propagate_range(
        self, start_idx: int, end_idx: int, reverse: bool, skip_flagged: bool = True
    ):
        """Propagate through a range of frames.

        Args:
            start_idx: Starting frame index
            end_idx: Ending frame index
            reverse: If True, propagate backward
            skip_flagged: If True, don't store results for low confidence frames

        Yields:
            Tuple of (current_frame, total_to_process, results_for_frame)
        """
        total = start_idx - end_idx if reverse else end_idx - start_idx

        if total <= 0:
            return

        frame_count = 0

        logger.debug(
            f"PropagationManager: _propagate_range called with "
            f"start_idx={start_idx}, end_idx={end_idx}, reverse={reverse}, total={total}"
        )

        # Pass None for max_frames to let SAM2 propagate to all frames
        # We filter by range ourselves to avoid ambiguity in SAM2's max_frame_num_to_track
        for frame_idx, obj_id, mask, confidence in self.sam2_model.propagate_in_video(
            start_frame_idx=start_idx,
            max_frames=None,
            reverse=reverse,
        ):
            # Check if frame is within our desired range
            if reverse:
                if frame_idx < end_idx:
                    break
            else:
                if frame_idx > end_idx:
                    break
            if self._cancel_requested:
                logger.info("PropagationManager: Propagation cancelled")
                return

            logger.debug(
                f"PropagationManager: SAM2 yielded frame_idx={frame_idx}, "
                f"obj_id={obj_id}, confidence={confidence:.3f}"
            )

            # Skip reference frames
            if frame_idx in self.state.reference_frame_indices:
                logger.debug(
                    f"PropagationManager: Skipping reference frame {frame_idx}"
                )
                continue

            # Check if this is a low confidence frame
            is_flagged = confidence < self.state.confidence_threshold

            # Skip flagged frames entirely if requested (no mask created)
            if is_flagged and skip_flagged:
                self.state.flagged_frames.add(frame_idx)
                logger.debug(
                    f"Skipping flagged frame {frame_idx} (confidence={confidence:.2f})"
                )
                continue

            # Get image path for this frame
            image_path = ""
            if frame_idx < len(self.sam2_model.video_image_paths):
                image_path = self.sam2_model.video_image_paths[frame_idx]

            # Create result
            result = PropagationResult(
                frame_idx=frame_idx,
                obj_id=obj_id,
                mask=mask,
                confidence=confidence,
                image_path=image_path,
            )

            # Store result
            if frame_idx not in self.state.frame_results:
                self.state.frame_results[frame_idx] = []
            self.state.frame_results[frame_idx].append(result)

            logger.debug(
                f"PropagationManager: Stored result for frame {frame_idx}, "
                f"obj_id={obj_id}, mask_shape={mask.shape if mask is not None else None}"
            )

            # Update status
            self.state.propagated_frames.add(frame_idx)
            if is_flagged:
                self.state.flagged_frames.add(frame_idx)

            frame_count += 1

            # Yield progress
            yield frame_idx, total, result

    # ========== Result Access ==========

    def get_frame_status(self, frame_idx: int) -> FrameStatus:
        """Get the status of a frame.

        Args:
            frame_idx: Frame index

        Returns:
            Frame status enum
        """
        if frame_idx in self.state.reference_frame_indices:
            return FrameStatus.REFERENCE
        if frame_idx in self.state.flagged_frames:
            return FrameStatus.FLAGGED
        if frame_idx in self.state.propagated_frames:
            return FrameStatus.PROPAGATED
        return FrameStatus.PENDING

    def get_frame_results(self, frame_idx: int) -> list[PropagationResult]:
        """Get propagation results for a frame.

        Args:
            frame_idx: Frame index

        Returns:
            List of propagation results for the frame
        """
        return self.state.frame_results.get(frame_idx, [])

    def get_reference_annotation_for_obj(
        self, obj_id: int
    ) -> ReferenceAnnotation | None:
        """Get reference annotation for an object ID.

        Args:
            obj_id: Object ID

        Returns:
            Reference annotation or None
        """
        for ann in self.state.reference_annotations:
            if ann.obj_id == obj_id:
                return ann
        return None

    def get_image_path_for_frame(self, frame_idx: int) -> str | None:
        """Get the image path for a frame index.

        Args:
            frame_idx: Frame index

        Returns:
            Image path or None
        """
        if self.sam2_model is not None and frame_idx < len(
            self.sam2_model.video_image_paths
        ):
            return self.sam2_model.video_image_paths[frame_idx]
        return None

    def get_frame_idx_for_path(self, image_path: str) -> int | None:
        """Get frame index for an image path.

        Args:
            image_path: Path to image

        Returns:
            Frame index or None
        """
        if self.sam2_model is None:
            return None

        # Normalize path for comparison
        target = Path(image_path).resolve()
        for idx, path in enumerate(self.sam2_model.video_image_paths):
            if Path(path).resolve() == target:
                return idx
        return None

    def get_next_flagged_frame(self, current_idx: int) -> int | None:
        """Get the next flagged frame after current index.

        Args:
            current_idx: Current frame index

        Returns:
            Next flagged frame index or None
        """
        flagged = sorted(self.state.flagged_frames)
        for idx in flagged:
            if idx > current_idx:
                return idx
        # Wrap around
        return flagged[0] if flagged else None

    def get_prev_flagged_frame(self, current_idx: int) -> int | None:
        """Get the previous flagged frame before current index.

        Args:
            current_idx: Current frame index

        Returns:
            Previous flagged frame index or None
        """
        flagged = sorted(self.state.flagged_frames, reverse=True)
        for idx in flagged:
            if idx < current_idx:
                return idx
        # Wrap around
        return flagged[0] if flagged else None

    def set_confidence_threshold(self, threshold: float) -> None:
        """Set the confidence threshold for flagging.

        Args:
            threshold: Confidence threshold (0-1)
        """
        self.state.confidence_threshold = max(0.0, min(1.0, threshold))

        # Re-evaluate flagged frames
        self.state.flagged_frames.clear()
        for frame_idx, results in self.state.frame_results.items():
            for result in results:
                if result.confidence < self.state.confidence_threshold:
                    self.state.flagged_frames.add(frame_idx)
                    break

        logger.info(
            f"PropagationManager: Threshold set to {self.state.confidence_threshold}, "
            f"{len(self.state.flagged_frames)} frames flagged"
        )

    # ========== Statistics ==========

    def get_propagation_stats(self) -> dict:
        """Get propagation statistics.

        Returns:
            Dictionary with propagation stats
        """
        return {
            "total_frames": self.state.total_frames,
            "reference_frames": list(self.state.reference_frame_indices),
            "num_reference_frames": len(self.state.reference_frame_indices),
            "num_reference_annotations": len(self.state.reference_annotations),
            "num_propagated": len(self.state.propagated_frames),
            "num_flagged": len(self.state.flagged_frames),
            "confidence_threshold": self.state.confidence_threshold,
        }
