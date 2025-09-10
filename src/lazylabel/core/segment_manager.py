"""Segment management functionality."""

from typing import Any

import cv2
import numpy as np
from PyQt6.QtCore import QPointF


class SegmentManager:
    """Manages image segments and classes."""

    def __init__(self):
        self.segments: list[dict[str, Any]] = []
        self.class_aliases: dict[int, str] = {}
        self.next_class_id: int = 0
        self.active_class_id: int | None = None  # Currently active/toggled class
        self.last_toggled_class_id: int | None = None  # Most recently toggled class

    def clear(self) -> None:
        """Clear all segments and reset state."""
        self.segments.clear()
        self.class_aliases.clear()
        self.next_class_id = 0
        self.active_class_id = None
        self.last_toggled_class_id = None

    def add_segment(self, segment_data: dict[str, Any]) -> None:
        """Add a new segment.

        If the segment is a polygon, convert QPointF objects to simple lists
        for serialization compatibility.
        """
        if "class_id" not in segment_data:
            # Use active class if available, otherwise use next class ID
            if self.active_class_id is not None:
                segment_data["class_id"] = self.active_class_id
            else:
                segment_data["class_id"] = self.next_class_id

        # Track the class used for this segment as the most recently used
        self.last_toggled_class_id = segment_data["class_id"]

        # Convert QPointF to list for storage if it's a polygon and contains QPointF objects
        if (
            segment_data.get("type") == "Polygon"
            and segment_data.get("vertices")
            and segment_data["vertices"]
            and isinstance(segment_data["vertices"][0], QPointF)
        ):
            segment_data["vertices"] = [
                [p.x(), p.y()] for p in segment_data["vertices"]
            ]

        self.segments.append(segment_data)
        self._update_next_class_id()

    def delete_segments(self, indices: list[int]) -> None:
        """Delete segments by indices."""
        for i in sorted(indices, reverse=True):
            if 0 <= i < len(self.segments):
                del self.segments[i]
        self._update_next_class_id()

    def assign_segments_to_class(self, indices: list[int]) -> None:
        """Assign selected segments to a class."""
        if not indices:
            return

        existing_class_ids = [
            self.segments[i]["class_id"]
            for i in indices
            if i < len(self.segments) and self.segments[i].get("class_id") is not None
        ]

        if existing_class_ids:
            target_class_id = min(existing_class_ids)
        else:
            target_class_id = self.next_class_id

        for i in indices:
            if i < len(self.segments):
                self.segments[i]["class_id"] = target_class_id

        self._update_next_class_id()

    def get_unique_class_ids(self) -> list[int]:
        """Get sorted list of unique class IDs."""
        return sorted(
            {
                seg.get("class_id")
                for seg in self.segments
                if seg.get("class_id") is not None
            }
        )

    def rasterize_polygon(
        self, vertices: list[QPointF], image_size: tuple[int, int]
    ) -> np.ndarray | None:
        """Convert polygon vertices to binary mask."""
        if not vertices:
            return None

        h, w = image_size
        points_np = np.array([[p.x(), p.y()] for p in vertices], dtype=np.int32)
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.fillPoly(mask, [points_np], 1)
        return mask.astype(bool)

    def create_final_mask_tensor(
        self,
        image_size: tuple[int, int],
        class_order: list[int],
        pixel_priority_enabled: bool = False,
        pixel_priority_ascending: bool = True,
    ) -> np.ndarray:
        """Create final mask tensor for saving."""
        h, w = image_size
        id_map = {old_id: new_id for new_id, old_id in enumerate(class_order)}
        num_final_classes = len(class_order)
        final_mask_tensor = np.zeros((h, w, num_final_classes), dtype=np.uint8)

        for seg in self.segments:
            class_id = seg.get("class_id")
            if class_id not in id_map:
                continue

            new_channel_idx = id_map[class_id]

            if seg["type"] == "Polygon":
                # Convert stored list of lists back to QPointF objects for rasterization
                qpoints = [QPointF(p[0], p[1]) for p in seg["vertices"]]
                mask = self.rasterize_polygon(qpoints, image_size)
            else:
                mask = seg.get("mask")

            if mask is not None:
                final_mask_tensor[:, :, new_channel_idx] = np.logical_or(
                    final_mask_tensor[:, :, new_channel_idx], mask
                )

        # Apply pixel priority if enabled
        if pixel_priority_enabled:
            final_mask_tensor = self._apply_pixel_priority(
                final_mask_tensor, pixel_priority_ascending
            )

        return final_mask_tensor

    def _apply_pixel_priority(
        self, mask_tensor: np.ndarray, ascending: bool
    ) -> np.ndarray:
        """Apply pixel priority to mask tensor so only one class can occupy each pixel.

        Args:
            mask_tensor: 3D array of shape (height, width, num_classes)
            ascending: If True, lower class indices have priority; if False, higher indices have priority

        Returns:
            Modified mask tensor with pixel priority applied
        """
        # Create a copy to avoid modifying the original
        prioritized_mask = mask_tensor.copy()

        # Find pixels with multiple class overlaps (sum > 1 across class dimension)
        overlap_pixels = np.sum(mask_tensor, axis=2) > 1

        if not np.any(overlap_pixels):
            # No overlapping pixels, return original
            return prioritized_mask

        # Get coordinates of overlapping pixels
        overlap_coords = np.where(overlap_pixels)

        for y, x in zip(overlap_coords[0], overlap_coords[1], strict=False):
            # Get all classes present at this pixel
            classes_at_pixel = np.where(mask_tensor[y, x, :] > 0)[0]

            if len(classes_at_pixel) <= 1:
                continue  # No overlap, skip

            # Determine priority class based on ascending/descending setting
            if ascending:
                priority_class = np.min(classes_at_pixel)  # Lowest index has priority
            else:
                priority_class = np.max(classes_at_pixel)  # Highest index has priority

            # Set all classes to 0 at this pixel
            prioritized_mask[y, x, :] = 0
            # Set only the priority class to 1
            prioritized_mask[y, x, priority_class] = 1

        return prioritized_mask

    def reassign_class_ids(self, new_order: list[int]) -> None:
        """Reassign class IDs based on new order."""
        id_map = {old_id: new_id for new_id, old_id in enumerate(new_order)}

        for seg in self.segments:
            old_id = seg.get("class_id")
            if old_id in id_map:
                seg["class_id"] = id_map[old_id]

        # Update aliases
        new_aliases = {
            id_map[old_id]: self.class_aliases.get(old_id, str(old_id))
            for old_id in new_order
            if old_id in self.class_aliases
        }
        self.class_aliases = new_aliases
        self._update_next_class_id()

    def set_class_alias(self, class_id: int, alias: str) -> None:
        """Set alias for a class."""
        self.class_aliases[class_id] = alias

    def get_class_alias(self, class_id: int) -> str:
        """Get alias for a class."""
        return self.class_aliases.get(class_id, str(class_id))

    def set_active_class(self, class_id: int | None) -> None:
        """Set the active class ID."""
        self.active_class_id = class_id

    def get_active_class(self) -> int | None:
        """Get the active class ID."""
        return self.active_class_id

    def toggle_active_class(self, class_id: int) -> bool:
        """Toggle a class as active. Returns True if now active, False if deactivated."""
        # Track this as the last toggled class
        self.last_toggled_class_id = class_id

        if self.active_class_id == class_id:
            self.active_class_id = None
            return False
        else:
            self.active_class_id = class_id
            return True

    def get_last_toggled_class(self) -> int | None:
        """Get the most recently toggled class ID."""
        return self.last_toggled_class_id

    def get_class_to_toggle_with_hotkey(self) -> int | None:
        """Get the class ID to toggle when using the hotkey.

        Returns the most recent class used/toggled, or if no recent class
        was used then returns the last class in the class list.
        """
        # If we have a recently toggled class, use that
        if self.last_toggled_class_id is not None:
            return self.last_toggled_class_id

        # Otherwise, get the last class in the class list (highest ID)
        unique_class_ids = self.get_unique_class_ids()
        if unique_class_ids:
            return unique_class_ids[-1]  # Last (highest) class ID

        return None

    def erase_segments_with_shape(
        self, erase_vertices: list[QPointF], image_size: tuple[int, int]
    ) -> list[int]:
        """Erase segments that overlap with the given shape.

        Args:
            erase_vertices: Vertices of the erase shape
            image_size: Size of the image (height, width)

        Returns:
            List of indices of segments that were removed
        """
        if not erase_vertices or not self.segments:
            return [], []

        # Create mask from erase shape
        erase_mask = self.rasterize_polygon(erase_vertices, image_size)
        if erase_mask is None:
            return [], []

        return self.erase_segments_with_mask(erase_mask, image_size)

    def erase_segments_with_mask(
        self, erase_mask: np.ndarray, image_size: tuple[int, int]
    ) -> list[int]:
        """Erase overlapping pixels from segments that overlap with the given mask.

        Args:
            erase_mask: Binary mask indicating pixels to erase
            image_size: Size of the image (height, width)

        Returns:
            List of indices of segments that were modified or removed
        """
        if erase_mask is None or not self.segments:
            return [], []

        modified_indices = []
        segments_to_remove = []
        segments_to_add = []
        removed_segments_data = []  # Store segment data for undo

        # Iterate through all segments to find overlaps
        for i, segment in enumerate(self.segments):
            segment_mask = self._get_segment_mask(segment, image_size)
            if segment_mask is None:
                continue

            # Check if there's any overlap between erase mask and segment mask
            overlap = np.logical_and(erase_mask, segment_mask)
            overlap_area = np.sum(overlap)

            if overlap_area > 0:
                modified_indices.append(i)

                # Store original segment data before modification
                removed_segments_data.append({"index": i, "segment": segment.copy()})

                # Create new mask by removing erased pixels
                new_mask = np.logical_and(segment_mask, ~erase_mask)
                remaining_area = np.sum(new_mask)

                if remaining_area == 0:
                    # All pixels were erased, remove segment entirely
                    segments_to_remove.append(i)
                else:
                    # Some pixels remain, check for disconnected components
                    # Use connected component analysis to split into separate segments
                    connected_segments = self._split_mask_into_components(
                        new_mask, segment.get("class_id")
                    )

                    # Mark original for removal and add all connected components
                    segments_to_remove.append(i)
                    segments_to_add.extend(connected_segments)

        # Remove segments in reverse order to maintain indices
        for i in sorted(segments_to_remove, reverse=True):
            del self.segments[i]

        # Add new segments (modified versions)
        for new_segment in segments_to_add:
            self.segments.append(new_segment)

        if modified_indices:
            self._update_next_class_id()

        return modified_indices, removed_segments_data

    def _get_segment_mask(
        self, segment: dict[str, Any], image_size: tuple[int, int]
    ) -> np.ndarray | None:
        """Get binary mask for a segment.

        Args:
            segment: Segment data
            image_size: Size of the image (height, width)

        Returns:
            Binary mask for the segment or None if unable to create
        """
        if segment["type"] == "Polygon" and "vertices" in segment:
            # Convert stored list of lists back to QPointF objects for rasterization
            qpoints = [QPointF(p[0], p[1]) for p in segment["vertices"]]
            return self.rasterize_polygon(qpoints, image_size)
        elif "mask" in segment and segment["mask"] is not None:
            return segment["mask"]
        return None

    def _split_mask_into_components(
        self, mask: np.ndarray, class_id: int | None
    ) -> list[dict[str, Any]]:
        """Split a mask into separate segments for each connected component.

        Args:
            mask: Binary mask to split
            class_id: Class ID to assign to all resulting segments

        Returns:
            List of segment dictionaries, one for each connected component
        """
        if mask is None or np.sum(mask) == 0:
            return []

        # Convert boolean mask to uint8 for OpenCV
        mask_uint8 = mask.astype(np.uint8)

        # Find connected components
        num_labels, labels = cv2.connectedComponents(mask_uint8, connectivity=8)

        segments = []

        # Create a segment for each component (skip label 0 which is background)
        for label in range(1, num_labels):
            component_mask = labels == label

            # Only create segment if component has significant size
            if np.sum(component_mask) > 10:  # Minimum 10 pixels
                new_segment = {
                    "type": "AI",  # Convert to mask-based segment
                    "mask": component_mask,
                    "vertices": None,
                    "class_id": class_id,
                }
                segments.append(new_segment)

        return segments

    def _update_next_class_id(self) -> None:
        """Update the next available class ID."""
        all_ids = {
            seg.get("class_id")
            for seg in self.segments
            if seg.get("class_id") is not None
        }
        if not all_ids:
            self.next_class_id = 0
        else:
            self.next_class_id = max(all_ids) + 1
