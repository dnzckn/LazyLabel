"""Sequence view mode for image series with SAM 2 propagation.

This module provides the SequenceViewMode class that manages state
and operations for sequence mode, enabling mask propagation across
image series using SAM 2's video predictor.
"""

import threading
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING

import numpy as np
from PyQt6.QtCore import QObject, pyqtSignal

if TYPE_CHECKING:
    from ..main_window import MainWindow


class FrameStatus(Enum):
    """Status of a frame in the sequence."""

    PENDING = "pending"  # Not yet processed
    REFERENCE = "reference"  # User-annotated reference frame
    PROPAGATED = "propagated"  # Mask propagated from reference
    FLAGGED = "flagged"  # Low confidence, needs review
    SAVED = "saved"  # Saved to disk (NPZ)
    SKIPPED = "skipped"  # Skipped due to dimension mismatch
    SUGGESTED = "suggested"  # AI-suggested reference frame


@dataclass
class ReferenceAnnotation:
    """Stores reference annotation for propagation."""

    frame_idx: int
    obj_id: int
    mask: np.ndarray
    class_id: int = 0
    points: list = field(default_factory=list)
    labels: list = field(default_factory=list)


class SequenceViewMode(QObject):
    """Manages sequence mode state and operations.

    This class handles:
    - Tracking reference frames and their annotations
    - Managing frame statuses (pending, propagated, flagged)
    - Coordinating with PropagationManager for SAM 2 propagation
    - Providing sequence navigation and review functionality
    """

    # Signals
    reference_changed = pyqtSignal(int)  # reference frame index
    frame_status_changed = pyqtSignal(int, str)  # frame_idx, status
    propagation_started = pyqtSignal()
    propagation_progress = pyqtSignal(int, int)  # current, total
    propagation_finished = pyqtSignal()
    propagation_error = pyqtSignal(str)

    def __init__(self, main_window: "MainWindow"):
        super().__init__()

        self.main_window = main_window

        # Thread safety — protects mutable state accessed from both the
        # propagation worker thread and the main/UI thread.
        self._lock = threading.Lock()

        # Sequence state
        self._image_paths: list[str] = []
        self._current_frame_idx: int = 0
        self._reference_annotations: dict[int, list[ReferenceAnnotation]] = {}
        self._frame_statuses: dict[int, FrameStatus] = {}
        self._propagated_masks: dict[int, dict[int, np.ndarray]] = {}
        self._confidence_scores: dict[int, float] = {}
        self._obj_class_map: dict[
            int, tuple[int, str]
        ] = {}  # obj_id -> (class_id, class_name)

        # Dimension tracking for sequence consistency
        self._reference_dimensions: tuple[int, int] | None = None  # (height, width)
        self._skipped_frame_indices: set[int] = set()

        # Suggested reference frames (from Find Archetypes)
        self._suggested_frames: list[int] = []

        # Configuration
        self._confidence_threshold: float = 0.99

    @property
    def total_frames(self) -> int:
        """Get total number of frames in sequence."""
        return len(self._image_paths)

    @property
    def current_frame_idx(self) -> int:
        """Get current frame index."""
        return self._current_frame_idx

    @property
    def reference_frame_indices(self) -> list[int]:
        """Get list of frames that have reference annotations."""
        return list(self._reference_annotations.keys())

    @property
    def primary_reference_idx(self) -> int:
        """Get the primary (first) reference frame index, or -1 if none."""
        refs = self.reference_frame_indices
        return refs[0] if refs else -1

    @property
    def reference_dimensions(self) -> tuple[int, int] | None:
        """Get the required image dimensions (height, width) for reference frames."""
        return self._reference_dimensions

    @property
    def skipped_frame_indices(self) -> set[int]:
        """Get set of frame indices skipped due to dimension mismatch."""
        return self._skipped_frame_indices

    def set_image_paths(self, paths: list[str]) -> None:
        """Set the image paths for the sequence."""
        self._image_paths = list(paths)
        self._reset_state()

    def _reset_state(self) -> None:
        """Reset all sequence state."""
        self._current_frame_idx = 0
        self._reference_annotations.clear()
        self._frame_statuses.clear()
        self._propagated_masks.clear()
        self._confidence_scores.clear()
        self._suggested_frames = []
        self._reference_dimensions = None
        self._skipped_frame_indices = set()

        # Initialize all frames as pending
        for i in range(len(self._image_paths)):
            self._frame_statuses[i] = FrameStatus.PENDING

    def clear_propagation_results(self) -> None:
        """Clear propagation results but keep reference frame.

        This should be called before starting a new propagation to ensure
        old results don't persist and get mixed with new ones.
        """
        self._propagated_masks.clear()
        self._confidence_scores.clear()

        # Reset non-reference, non-skipped frame statuses to pending
        for idx in self._frame_statuses:
            if self._frame_statuses[idx] not in (
                FrameStatus.REFERENCE,
                FrameStatus.SKIPPED,
            ):
                self._frame_statuses[idx] = FrameStatus.PENDING
                self.frame_status_changed.emit(idx, FrameStatus.PENDING.value)

    def get_image_path(self, idx: int) -> str | None:
        """Get image path for a frame index."""
        if 0 <= idx < len(self._image_paths):
            return self._image_paths[idx]
        return None

    def get_frame_idx_for_path(self, path: str) -> int | None:
        """Get frame index for a given image path.

        Args:
            path: Image file path

        Returns:
            Frame index if found, None otherwise
        """
        from pathlib import Path

        # Normalize path for comparison
        normalized = str(Path(path).resolve())
        for idx, img_path in enumerate(self._image_paths):
            if str(Path(img_path).resolve()) == normalized:
                return idx
        return None

    def set_current_frame(self, idx: int) -> bool:
        """Set current frame index.

        Returns:
            True if frame was changed, False if invalid index
        """
        if 0 <= idx < len(self._image_paths):
            self._current_frame_idx = idx
            return True
        return False

    def get_frame_status(self, idx: int) -> str:
        """Get status string for a frame.

        Returns one of: 'reference', 'propagated', 'pending', 'flagged'
        """
        with self._lock:
            status = self._frame_statuses.get(idx, FrameStatus.PENDING)
            return status.value

    def get_all_frame_statuses(self) -> dict[int, str]:
        """Get status dict for all frames (for batch update of timeline)."""
        with self._lock:
            return {idx: status.value for idx, status in self._frame_statuses.items()}

    def set_reference_frame(
        self,
        idx: int,
        annotations: list[ReferenceAnnotation] | None = None,
        image_dimensions: tuple[int, int] | None = None,
    ) -> bool:
        """Mark a frame as reference with its annotations.

        Args:
            idx: Frame index to mark as reference
            annotations: List of annotations (masks, points, etc.) for this frame.
                        If None, will capture current annotations from segment manager.
            image_dimensions: Optional (height, width) tuple for dimension validation.
                If provided and reference dimensions are already set, the frame
                will be rejected if dimensions don't match.

        Returns:
            True if successful, False if invalid index or dimension mismatch
        """
        if not (0 <= idx < len(self._image_paths)):
            return False

        # Validate image dimensions if provided
        if image_dimensions is not None:
            if self._reference_dimensions is None:
                self._reference_dimensions = image_dimensions
            elif image_dimensions != self._reference_dimensions:
                return False

        if annotations is None:
            annotations = self._capture_current_annotations(idx)

        self._reference_annotations[idx] = annotations
        self._frame_statuses[idx] = FrameStatus.REFERENCE
        self.frame_status_changed.emit(idx, FrameStatus.REFERENCE.value)
        self.reference_changed.emit(idx)
        return True

    def _capture_current_annotations(self, frame_idx: int) -> list[ReferenceAnnotation]:
        """Capture current segment annotations for a frame."""
        annotations = []

        # Get segments from the segment manager (segments is a list of dicts)
        segment_manager = self.main_window.segment_manager
        for seg_idx, segment in enumerate(segment_manager.segments):
            mask = segment.get("mask")
            class_id = segment.get("class_id", 0)

            if mask is not None:
                ann = ReferenceAnnotation(
                    frame_idx=frame_idx,
                    obj_id=seg_idx + 1,  # Use 1-based obj_id for SAM 2
                    mask=mask.copy(),
                    class_id=class_id,
                )
                annotations.append(ann)

        return annotations

    def clear_reference_frame(self, idx: int) -> bool:
        """Remove reference status from a frame.

        Returns:
            True if frame was a reference and is now cleared, False otherwise
        """
        if idx in self._reference_annotations:
            del self._reference_annotations[idx]
            self._frame_statuses[idx] = FrameStatus.PENDING
            self.frame_status_changed.emit(idx, FrameStatus.PENDING.value)

            # Clear stored dimensions when no references remain
            if not self._reference_annotations:
                self._reference_dimensions = None

            self.reference_changed.emit(
                -1 if not self._reference_annotations else self.primary_reference_idx
            )
            return True
        return False

    def mark_frame_propagated(
        self, idx: int, masks: dict[int, np.ndarray], confidence: float = 1.0
    ) -> None:
        """Mark a frame as propagated with its masks.

        Args:
            idx: Frame index
            masks: Dict mapping object_id to mask array (merged with existing)
            confidence: Confidence score (0-1) for this propagation
        """
        with self._lock:
            # Merge masks with existing ones for this frame (multiple objects per frame)
            if idx in self._propagated_masks:
                self._propagated_masks[idx].update(masks)
            else:
                self._propagated_masks[idx] = masks.copy()

            # Update confidence (use minimum if multiple objects)
            if idx in self._confidence_scores:
                self._confidence_scores[idx] = min(
                    self._confidence_scores[idx], confidence
                )
            else:
                self._confidence_scores[idx] = confidence

            if self._confidence_scores[idx] < self._confidence_threshold:
                self._frame_statuses[idx] = FrameStatus.FLAGGED
            else:
                self._frame_statuses[idx] = FrameStatus.PROPAGATED

            status = self._frame_statuses[idx]

        self.frame_status_changed.emit(idx, status.value)

    def flag_frame(self, idx: int) -> None:
        """Manually flag a frame for review."""
        with self._lock:
            if 0 <= idx < len(self._image_paths):
                self._frame_statuses[idx] = FrameStatus.FLAGGED
        self.frame_status_changed.emit(idx, FrameStatus.FLAGGED.value)

    def unflag_frame(self, idx: int) -> None:
        """Remove flag from a frame (mark as propagated if it has masks)."""
        with self._lock:
            if idx in self._propagated_masks:
                self._frame_statuses[idx] = FrameStatus.PROPAGATED
                status = FrameStatus.PROPAGATED
            else:
                self._frame_statuses[idx] = FrameStatus.PENDING
                status = FrameStatus.PENDING
        self.frame_status_changed.emit(idx, status.value)

    def mark_frame_saved(self, idx: int) -> None:
        """Mark a frame as saved to disk."""
        with self._lock:
            if 0 <= idx < len(self._image_paths):
                self._frame_statuses[idx] = FrameStatus.SAVED
                # Clear propagated masks since they're now saved
                if idx in self._propagated_masks:
                    del self._propagated_masks[idx]
        self.frame_status_changed.emit(idx, FrameStatus.SAVED.value)

    def register_obj_class(self, obj_id: int, class_id: int, class_name: str) -> None:
        """Store the class mapping for a propagation object ID.

        This survives propagation manager cleanup and trim operations.
        """
        with self._lock:
            self._obj_class_map[obj_id] = (class_id, class_name)

    def get_obj_class(self, obj_id: int) -> tuple[int, str] | None:
        """Look up class info for a propagation object ID."""
        with self._lock:
            return self._obj_class_map.get(obj_id)

    def get_propagated_masks(self, idx: int) -> dict[int, np.ndarray] | None:
        """Get propagated masks for a frame."""
        with self._lock:
            return self._propagated_masks.get(idx)

    def clear_propagated_mask(self, idx: int) -> None:
        """Clear propagated masks for a specific frame.

        Used when skipping flagged frames to remove any partially stored masks.
        """
        with self._lock:
            if idx in self._propagated_masks:
                del self._propagated_masks[idx]
            if idx in self._confidence_scores:
                del self._confidence_scores[idx]

    def get_all_confidence_scores(self) -> dict[int, float]:
        """Get confidence scores for all frames that have them."""
        with self._lock:
            return dict(self._confidence_scores)

    def get_confidence_score(self, idx: int) -> float:
        """Get confidence score for a propagated frame."""
        with self._lock:
            return self._confidence_scores.get(idx, 0.0)

    def get_flagged_frames(self) -> list[int]:
        """Get list of frame indices flagged for review."""
        with self._lock:
            return [
                idx
                for idx, status in self._frame_statuses.items()
                if status == FrameStatus.FLAGGED
            ]

    def get_propagated_frames(self) -> list[int]:
        """Get list of frame indices that have been propagated."""
        with self._lock:
            return [
                idx
                for idx, status in self._frame_statuses.items()
                if status == FrameStatus.PROPAGATED
            ]

    def next_flagged_frame(self) -> int | None:
        """Get next flagged frame after current position.

        Returns:
            Frame index or None if no more flagged frames
        """
        flagged = sorted(self.get_flagged_frames())
        for idx in flagged:
            if idx > self._current_frame_idx:
                return idx
        # Wrap around
        return flagged[0] if flagged else None

    def prev_flagged_frame(self) -> int | None:
        """Get previous flagged frame before current position.

        Returns:
            Frame index or None if no flagged frames
        """
        flagged = sorted(self.get_flagged_frames(), reverse=True)
        for idx in flagged:
            if idx < self._current_frame_idx:
                return idx
        # Wrap around
        return flagged[0] if flagged else None

    def next_reference_frame(self) -> int | None:
        """Get next reference frame after current position.

        Returns:
            Frame index or None if no more reference frames
        """
        refs = sorted(self.reference_frame_indices)
        for idx in refs:
            if idx > self._current_frame_idx:
                return idx
        # Wrap around
        return refs[0] if refs else None

    def prev_reference_frame(self) -> int | None:
        """Get previous reference frame before current position.

        Returns:
            Frame index or None if no reference frames
        """
        refs = sorted(self.reference_frame_indices, reverse=True)
        for idx in refs:
            if idx < self._current_frame_idx:
                return idx
        # Wrap around
        return refs[0] if refs else None

    # --- Suggested reference frames ---

    def set_suggested_frames(self, indices: list[int]) -> None:
        """Set AI-suggested reference frames.

        Only marks frames as SUGGESTED if their current status is PENDING.
        Does not overwrite REFERENCE, PROPAGATED, SAVED, etc.

        Args:
            indices: Sorted list of suggested frame indices (0-indexed)
        """
        self._suggested_frames = sorted(indices)
        with self._lock:
            for idx in self._suggested_frames:
                if self._frame_statuses.get(idx) == FrameStatus.PENDING:
                    self._frame_statuses[idx] = FrameStatus.SUGGESTED
                    self.frame_status_changed.emit(idx, FrameStatus.SUGGESTED.value)

    def clear_suggested_frames(self) -> None:
        """Clear all suggested reference frame highlights."""
        with self._lock:
            for idx in self._suggested_frames:
                if self._frame_statuses.get(idx) == FrameStatus.SUGGESTED:
                    self._frame_statuses[idx] = FrameStatus.PENDING
                    self.frame_status_changed.emit(idx, FrameStatus.PENDING.value)
        self._suggested_frames = []

    def get_suggested_frames(self) -> list[int]:
        """Get list of suggested reference frame indices."""
        return list(self._suggested_frames)

    def next_suggested_frame(self) -> int | None:
        """Get next suggested frame after current position.

        Returns:
            Frame index or None if no more suggested frames
        """
        for idx in self._suggested_frames:
            if idx > self._current_frame_idx:
                return idx
        # Wrap around
        return self._suggested_frames[0] if self._suggested_frames else None

    def prev_suggested_frame(self) -> int | None:
        """Get previous suggested frame before current position.

        Returns:
            Frame index or None if no suggested frames
        """
        for idx in reversed(self._suggested_frames):
            if idx < self._current_frame_idx:
                return idx
        # Wrap around
        return self._suggested_frames[-1] if self._suggested_frames else None

    def set_confidence_threshold(self, threshold: float) -> None:
        """Set confidence threshold for auto-flagging."""
        self._confidence_threshold = max(0.0, min(1.0, threshold))

    def get_reference_annotations(
        self, idx: int | None = None
    ) -> list[ReferenceAnnotation]:
        """Get reference annotations for a frame.

        Args:
            idx: Frame index, or None for primary reference

        Returns:
            List of ReferenceAnnotation objects
        """
        if idx is None:
            idx = self.primary_reference_idx
        return self._reference_annotations.get(idx, [])

    def has_reference(self) -> bool:
        """Check if any reference frame is set."""
        return len(self._reference_annotations) > 0

    def get_propagation_range(
        self, direction: str, start: int, end: int
    ) -> tuple[int, int]:
        """Get actual frame range for propagation.

        Args:
            direction: 'forward', 'backward', or 'both'
            start: Requested start frame
            end: Requested end frame

        Returns:
            Tuple of (start_idx, end_idx) for propagation
        """
        ref_idx = self.primary_reference_idx
        if ref_idx < 0:
            return (0, 0)

        if direction == "forward":
            return (ref_idx, min(end, len(self._image_paths) - 1))
        elif direction == "backward":
            return (max(0, start), ref_idx)
        else:  # both
            return (max(0, start), min(end, len(self._image_paths) - 1))

    def mark_frames_skipped(self, indices: set[int]) -> None:
        """Mark frames as skipped due to dimension mismatch.

        Args:
            indices: Set of frame indices to mark as skipped
        """
        self._skipped_frame_indices = set(indices)
        for idx in indices:
            if 0 <= idx < len(self._image_paths):
                self._frame_statuses[idx] = FrameStatus.SKIPPED
                self.frame_status_changed.emit(idx, FrameStatus.SKIPPED.value)

    def trim_frames(self, indices_to_remove: set[int]) -> list[str]:
        """Remove frames from the timeline by index.

        Rebuilds all internal state with remapped indices. Does NOT affect
        files on disk — trimming is timeline-only.

        Args:
            indices_to_remove: Set of frame indices to remove.

        Returns:
            List of image paths that were removed.

        Raises:
            ValueError: If removing all frames.
        """
        with self._lock:
            return self._trim_frames_unlocked(indices_to_remove)

    def _trim_frames_unlocked(self, indices_to_remove: set[int]) -> list[str]:
        """Internal trim implementation (caller must hold self._lock)."""
        total = len(self._image_paths)
        keep = sorted(i for i in range(total) if i not in indices_to_remove)
        if not keep:
            raise ValueError("Cannot trim all frames from the timeline")

        removed_paths = [
            self._image_paths[i] for i in sorted(indices_to_remove) if i < total
        ]

        # Snapshot all per-frame data keyed by image path so statuses
        # stay tied to the frame identity, not the index.
        path_status = {
            self._image_paths[i]: self._frame_statuses.get(i, FrameStatus.PENDING)
            for i in range(total)
        }
        path_confidence = {
            self._image_paths[i]: self._confidence_scores[i]
            for i in self._confidence_scores
            if i < total
        }
        path_masks = {
            self._image_paths[i]: self._propagated_masks[i]
            for i in self._propagated_masks
            if i < total
        }
        path_refs = {
            self._image_paths[i]: self._reference_annotations[i]
            for i in self._reference_annotations
            if i < total
        }
        path_skipped = {
            self._image_paths[i] for i in self._skipped_frame_indices if i < total
        }
        path_suggested = {
            self._image_paths[i] for i in self._suggested_frames if i < total
        }

        # Remember current frame's path before trimming
        current_path = self._image_paths[self._current_frame_idx]

        # Rebuild image paths (new indices are implicitly 0..len-1)
        self._image_paths = [self._image_paths[i] for i in keep]

        # Rebuild everything from path-keyed snapshots
        self._frame_statuses = {
            new_idx: path_status.get(path, FrameStatus.PENDING)
            for new_idx, path in enumerate(self._image_paths)
        }
        self._confidence_scores = {
            new_idx: path_confidence[path]
            for new_idx, path in enumerate(self._image_paths)
            if path in path_confidence
        }
        self._propagated_masks = {
            new_idx: path_masks[path]
            for new_idx, path in enumerate(self._image_paths)
            if path in path_masks
        }
        new_refs: dict[int, list[ReferenceAnnotation]] = {}
        for new_idx, path in enumerate(self._image_paths):
            if path in path_refs:
                anns = path_refs[path]
                for ann in anns:
                    ann.frame_idx = new_idx
                new_refs[new_idx] = anns
        self._reference_annotations = new_refs

        self._skipped_frame_indices = {
            new_idx
            for new_idx, path in enumerate(self._image_paths)
            if path in path_skipped
        }
        self._suggested_frames = sorted(
            new_idx
            for new_idx, path in enumerate(self._image_paths)
            if path in path_suggested
        )

        # Adjust current frame index
        if current_path in self._image_paths:
            self._current_frame_idx = self._image_paths.index(current_path)
        else:
            # Current frame was removed — pick nearest kept frame
            old_to_new = {old: new for new, old in enumerate(keep)}
            nearest = min(keep, key=lambda k: abs(k - self._current_frame_idx))
            self._current_frame_idx = old_to_new[nearest]

        # Clear reference dimensions if no references remain
        if not self._reference_annotations:
            self._reference_dimensions = None

        return removed_paths

    def to_dict(self) -> dict:
        """Serialize sequence state to dict (for saving)."""
        return {
            "image_paths": self._image_paths,
            "current_frame_idx": self._current_frame_idx,
            "reference_frame_indices": self.reference_frame_indices,
            "frame_statuses": {k: v.value for k, v in self._frame_statuses.items()},
            "confidence_scores": self._confidence_scores,
            "confidence_threshold": self._confidence_threshold,
            "obj_class_map": {str(k): list(v) for k, v in self._obj_class_map.items()},
        }

    def from_dict(self, data: dict) -> None:
        """Restore sequence state from dict."""
        self._image_paths = data.get("image_paths", [])
        self._current_frame_idx = data.get("current_frame_idx", 0)
        self._confidence_threshold = data.get("confidence_threshold", 0.99)
        self._confidence_scores = data.get("confidence_scores", {})

        # Restore frame statuses
        status_dict = data.get("frame_statuses", {})
        for idx_str, status_str in status_dict.items():
            try:
                idx = int(idx_str)
                status = FrameStatus(status_str)
                self._frame_statuses[idx] = status
            except (ValueError, KeyError):
                pass

        # Restore obj_id → class mapping
        obj_map = data.get("obj_class_map", {})
        for obj_id_str, class_info in obj_map.items():
            try:
                obj_id = int(obj_id_str)
                self._obj_class_map[obj_id] = (class_info[0], class_info[1])
            except (ValueError, IndexError, TypeError):
                pass
