"""Propagation manager for SAM 2 video-based mask propagation.

This manager handles:
- Video state initialization for image sequences
- Reference frame annotation management
- Forward/backward propagation execution
- Confidence scoring and frame flagging
- Progress tracking for UI updates
"""

from __future__ import annotations

from collections.abc import Callable
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
    SKIPPED = "skipped"


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
    )  # Multiple reference frames (SAM2 space)
    reference_annotations: list[ReferenceAnnotation] = field(default_factory=list)
    propagated_frames: set[int] = field(default_factory=set)  # Timeline space
    flagged_frames: set[int] = field(default_factory=set)  # Timeline space
    frame_results: dict[int, list[PropagationResult]] = field(
        default_factory=dict
    )  # Timeline space
    confidence_threshold: float = 0.99

    # Dimension filtering and index mapping
    sam2_to_timeline: dict[int, int] = field(default_factory=dict)
    timeline_to_sam2: dict[int, int] = field(default_factory=dict)
    skipped_frame_indices: set[int] = field(default_factory=set)
    reference_dimensions: tuple[int, int] | None = None


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

    def init_sequence(
        self,
        image_paths: list[str],
        reference_dimensions: tuple[int, int] | None = None,
        image_cache: dict[str, np.ndarray] | None = None,
        progress_callback: Callable[[int, int, str], None] | None = None,
    ) -> bool:
        """Initialize the video predictor with an image sequence.

        Images with dimensions that don't match reference_dimensions are
        automatically filtered out. A mapping between SAM2 frame indices
        and timeline frame indices is stored in self.state.

        Args:
            image_paths: List of image file paths for the sequence. Only
                these images are loaded into the video predictor.
            reference_dimensions: Optional (height, width) tuple. If provided,
                images with different dimensions are skipped.
            image_cache: Optional dict mapping image paths to numpy arrays.
                If provided, cached images will be used instead of reading
                from disk, which saves I/O when images are preloaded.
            progress_callback: Optional callback(current, total, message)
                for reporting per-image progress to the UI.

        Returns:
            True if successful, False otherwise
        """
        import cv2

        if self.sam2_model is None:
            logger.error("PropagationManager: SAM 2 model not available")
            return False

        # Check if video predictor is available
        if not hasattr(self.sam2_model, "init_video_state"):
            logger.error("PropagationManager: SAM 2 video predictor not available")
            return False

        # Filter images by reference dimensions
        filtered_paths: list[str] = []
        sam2_to_timeline: dict[int, int] = {}
        timeline_to_sam2: dict[int, int] = {}
        skipped: set[int] = set()

        if reference_dimensions is not None:
            ref_h, ref_w = reference_dimensions
            total_images = len(image_paths)
            for timeline_idx, path in enumerate(image_paths):
                # Get image dimensions
                if image_cache and path in image_cache:
                    h, w = image_cache[path].shape[:2]
                else:
                    img = cv2.imread(path)
                    if img is None:
                        skipped.add(timeline_idx)
                        continue
                    h, w = img.shape[:2]

                if (h, w) != (ref_h, ref_w):
                    skipped.add(timeline_idx)
                    logger.info(
                        f"PropagationManager: Skipping frame {timeline_idx}: "
                        f"dimensions ({w}x{h}) != reference ({ref_w}x{ref_h})"
                    )
                    if progress_callback:
                        progress_callback(
                            timeline_idx + 1,
                            total_images,
                            f"Skipping frame {timeline_idx + 1} "
                            f"(dimension mismatch: {w}x{h})",
                        )
                    continue

                sam2_idx = len(filtered_paths)
                sam2_to_timeline[sam2_idx] = timeline_idx
                timeline_to_sam2[timeline_idx] = sam2_idx
                filtered_paths.append(path)

            if skipped:
                logger.info(
                    f"PropagationManager: Filtered {len(skipped)} images "
                    f"with mismatched dimensions, {len(filtered_paths)} remaining"
                )
        else:
            # No filtering - 1:1 mapping
            filtered_paths = list(image_paths)
            for i in range(len(image_paths)):
                sam2_to_timeline[i] = i
                timeline_to_sam2[i] = i

        if not filtered_paths:
            logger.error("PropagationManager: No images match reference dimensions")
            return False

        # Initialize video state with only the matching images
        if not self.sam2_model.init_video_state(
            filtered_paths,
            image_cache=image_cache,
            progress_callback=progress_callback,
        ):
            logger.error("PropagationManager: Failed to initialize video state")
            return False

        # Reset propagation state with index mapping
        self.state = PropagationState(
            is_initialized=True,
            total_frames=self.sam2_model.video_frame_count,
            confidence_threshold=0.99,
            sam2_to_timeline=sam2_to_timeline,
            timeline_to_sam2=timeline_to_sam2,
            skipped_frame_indices=skipped,
            reference_dimensions=reference_dimensions,
        )

        logger.info(
            f"PropagationManager: Initialized with {self.state.total_frames} frames"
            f" ({len(skipped)} skipped)"
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
            frame_idx: Timeline index of the reference frame (0-based).
                Automatically translated to SAM2 internal index.

        Returns:
            True if successful
        """
        if not self.is_initialized:
            logger.error("PropagationManager: Not initialized")
            return False

        # Translate timeline index to SAM2 index
        sam2_idx = self.state.timeline_to_sam2.get(frame_idx, frame_idx)

        if sam2_idx < 0 or sam2_idx >= self.state.total_frames:
            logger.error(
                f"PropagationManager: Invalid frame index {frame_idx} "
                f"(SAM2: {sam2_idx})"
            )
            return False

        self.state.reference_frame_indices.add(sam2_idx)
        logger.info(
            f"PropagationManager: Added reference frame {frame_idx} (SAM2: {sam2_idx})"
        )
        return True

    def add_reference_frames(self, frame_indices: list[int]) -> int:
        """Add multiple frames to the reference set.

        Args:
            frame_indices: List of timeline frame indices to add

        Returns:
            Number of frames successfully added
        """
        if not self.is_initialized:
            logger.error("PropagationManager: Not initialized")
            return 0

        count = 0
        for idx in frame_indices:
            sam2_idx = self.state.timeline_to_sam2.get(idx, idx)
            if 0 <= sam2_idx < self.state.total_frames:
                self.state.reference_frame_indices.add(sam2_idx)
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
            frame_idx: Timeline frame index where the annotation is located.
                Automatically translated to SAM2 internal index.
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

        # Translate timeline index to SAM2 index
        sam2_idx = self.state.timeline_to_sam2.get(frame_idx)
        if sam2_idx is None:
            logger.error(f"PropagationManager: Frame {frame_idx} is skipped or unknown")
            return -1

        # Ensure the frame is marked as a reference
        self.state.reference_frame_indices.add(sam2_idx)

        # Auto-assign object ID if not provided
        if obj_id is None:
            existing_ids = {ann.obj_id for ann in self.state.reference_annotations}
            obj_id = max(existing_ids, default=0) + 1

        annotation = ReferenceAnnotation(
            frame_idx=sam2_idx,
            obj_id=obj_id,
            mask=mask.copy(),
            class_id=class_id,
            class_name=class_name,
        )
        self.state.reference_annotations.append(annotation)

        # Add mask to SAM 2 video predictor using SAM2 index
        if self.sam2_model is not None:
            result = self.sam2_model.add_video_mask(
                frame_idx=sam2_idx,
                obj_id=obj_id,
                mask=mask,
            )
            if result is not None:
                logger.info(
                    f"PropagationManager: Added reference annotation obj_id={obj_id}, "
                    f"frame={frame_idx} (SAM2: {sam2_idx}), "
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

    # ========== Index Translation ==========

    def _timeline_to_nearest_sam2(
        self, timeline_idx: int, prefer_higher: bool = False
    ) -> int:
        """Convert a timeline index to the nearest SAM2 index.

        When the exact timeline index was skipped, finds the closest
        mapped index in the preferred direction.

        Args:
            timeline_idx: Timeline frame index
            prefer_higher: If True, prefer the next higher SAM2 index;
                otherwise prefer the next lower one.

        Returns:
            Nearest valid SAM2 frame index
        """
        if timeline_idx in self.state.timeline_to_sam2:
            return self.state.timeline_to_sam2[timeline_idx]

        mapped = sorted(self.state.timeline_to_sam2.keys())
        if not mapped:
            return timeline_idx

        if prefer_higher:
            for t in mapped:
                if t >= timeline_idx:
                    return self.state.timeline_to_sam2[t]
            return self.state.timeline_to_sam2[mapped[-1]]
        else:
            for t in reversed(mapped):
                if t <= timeline_idx:
                    return self.state.timeline_to_sam2[t]
            return self.state.timeline_to_sam2[mapped[0]]

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
        # Reference indices are stored in SAM2 space
        ref_indices = self.state.reference_frame_indices
        min_ref = min(ref_indices) if ref_indices else 0
        max_ref = max(ref_indices) if ref_indices else 0

        # Convert timeline range to SAM2 space
        sam2_start = (
            self._timeline_to_nearest_sam2(range_start, prefer_higher=True)
            if range_start is not None
            else None
        )
        sam2_end = (
            self._timeline_to_nearest_sam2(range_end, prefer_higher=False)
            if range_end is not None
            else None
        )

        if direction == PropagationDirection.FORWARD:
            start = sam2_start if sam2_start is not None else min_ref
            end = sam2_end if sam2_end is not None else self.state.total_frames - 1
            yield from self._propagate_range(
                start, end, reverse=False, skip_flagged=skip_flagged
            )

        elif direction == PropagationDirection.BACKWARD:
            start = sam2_start if sam2_start is not None else 0
            end = sam2_end if sam2_end is not None else max_ref
            yield from self._propagate_range(
                end, start, reverse=True, skip_flagged=skip_flagged
            )

        elif direction == PropagationDirection.BIDIRECTIONAL:
            # Propagate forward from min reference to end
            end = sam2_end if sam2_end is not None else self.state.total_frames - 1
            yield from self._propagate_range(
                min_ref, end, reverse=False, skip_flagged=skip_flagged
            )

            if self._cancel_requested:
                return

            # Then propagate backward from min reference to start
            start = sam2_start if sam2_start is not None else 0
            if min_ref > start:
                yield from self._propagate_range(
                    min_ref, start, reverse=True, skip_flagged=skip_flagged
                )

    def _propagate_range(
        self, start_idx: int, end_idx: int, reverse: bool, skip_flagged: bool = True
    ):
        """Propagate through a range of frames.

        All indices in this method are in SAM2 space internally.
        Yielded frame indices are translated to timeline space.

        Args:
            start_idx: Starting SAM2 frame index
            end_idx: Ending SAM2 frame index
            reverse: If True, propagate backward
            skip_flagged: If True, don't store results for low confidence frames

        Yields:
            Tuple of (timeline_frame_idx, total_to_process, results_for_frame)
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
            # Check if frame is within our desired range (SAM2 space)
            if reverse:
                if frame_idx < end_idx:
                    break
            else:
                if frame_idx > end_idx:
                    break
            if self._cancel_requested:
                logger.info("PropagationManager: Propagation cancelled")
                return

            # Translate SAM2 frame index to timeline index
            timeline_idx = self.state.sam2_to_timeline.get(frame_idx, frame_idx)

            logger.debug(
                f"PropagationManager: SAM2 yielded frame_idx={frame_idx} "
                f"(timeline: {timeline_idx}), "
                f"obj_id={obj_id}, confidence={confidence:.3f}"
            )

            # Skip reference frames (checked in SAM2 space)
            if frame_idx in self.state.reference_frame_indices:
                logger.debug(
                    f"PropagationManager: Skipping reference frame {frame_idx}"
                )
                continue

            # Check if this is a low confidence frame
            is_flagged = confidence < self.state.confidence_threshold

            # Skip flagged frames entirely if requested (no mask created)
            if is_flagged and skip_flagged:
                self.state.flagged_frames.add(timeline_idx)
                logger.debug(
                    f"Skipping flagged frame {timeline_idx} "
                    f"(confidence={confidence:.2f})"
                )
                continue

            # Get image path for this frame (SAM2 space index)
            image_path = ""
            if frame_idx < len(self.sam2_model.video_image_paths):
                image_path = self.sam2_model.video_image_paths[frame_idx]

            # Create result with timeline index
            result = PropagationResult(
                frame_idx=timeline_idx,
                obj_id=obj_id,
                mask=mask,
                confidence=confidence,
                image_path=image_path,
            )

            # Store result keyed by timeline index
            if timeline_idx not in self.state.frame_results:
                self.state.frame_results[timeline_idx] = []
            self.state.frame_results[timeline_idx].append(result)

            logger.debug(
                f"PropagationManager: Stored result for frame {timeline_idx}, "
                f"obj_id={obj_id}, mask_shape={mask.shape if mask is not None else None}"
            )

            # Update status using timeline indices
            self.state.propagated_frames.add(timeline_idx)
            if is_flagged:
                self.state.flagged_frames.add(timeline_idx)

            frame_count += 1

            # Yield progress with timeline index
            yield timeline_idx, total, result

    # ========== Result Access ==========

    def get_frame_status(self, frame_idx: int) -> FrameStatus:
        """Get the status of a frame.

        Args:
            frame_idx: Timeline frame index

        Returns:
            Frame status enum
        """
        if frame_idx in self.state.skipped_frame_indices:
            return FrameStatus.SKIPPED
        # Check if this timeline idx maps to a reference SAM2 idx
        sam2_idx = self.state.timeline_to_sam2.get(frame_idx)
        if sam2_idx is not None and sam2_idx in self.state.reference_frame_indices:
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
