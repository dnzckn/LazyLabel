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

    def merge_segments_by_class(self) -> None:
        """Merge all segments with the same class_id into single segments.

        This consolidates multiple segments of the same class into one segment
        per class, using logical OR to combine their masks. This is similar to
        how create_final_mask_tensor merges segments for saving, but modifies
        the segment list in-place.

        Polygons are rasterized to masks before merging. The merged segments
        will all be mask-based (type="Loaded").
        """
        if not self.segments:
            return

        # Group segments by class_id
        class_segments: dict[int, list[dict]] = {}
        for seg in self.segments:
            class_id = seg.get("class_id")
            if class_id is None:
                continue
            if class_id not in class_segments:
                class_segments[class_id] = []
            class_segments[class_id].append(seg)

        # If no segments have class_id, nothing to merge
        if not class_segments:
            return

        # Determine image size from first segment with a mask
        image_size = None
        for seg in self.segments:
            mask = seg.get("mask")
            if mask is not None:
                image_size = mask.shape[:2]
                break

        if image_size is None:
            # No masks found, can't merge
            return

        # Create merged segments
        merged_segments = []
        for class_id in sorted(class_segments.keys()):
            segments_for_class = class_segments[class_id]

            # Initialize merged mask
            merged_mask = np.zeros(image_size, dtype=bool)

            for seg in segments_for_class:
                if seg.get("type") == "Polygon" and seg.get("vertices"):
                    # Rasterize polygon to mask
                    qpoints = [QPointF(p[0], p[1]) for p in seg["vertices"]]
                    mask = self.rasterize_polygon(qpoints, image_size)
                else:
                    mask = seg.get("mask")

                # Ensure mask exists and shape matches
                if mask is not None and mask.shape[:2] == image_size:
                    merged_mask = np.logical_or(merged_mask, mask)

            # Only create segment if mask has content
            if np.any(merged_mask):
                merged_segments.append(
                    {
                        "mask": merged_mask,
                        "type": "Loaded",
                        "vertices": None,
                        "class_id": class_id,
                    }
                )

        # Replace segments with merged versions
        self.segments = merged_segments
        self._update_next_class_id()

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

            if seg.get("type") == "Polygon":
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

        Uses vectorized numpy operations for performance.

        Args:
            mask_tensor: 3D array of shape (height, width, num_classes)
            ascending: If True, lower class indices have priority; if False, higher

        Returns:
            Modified mask tensor with pixel priority applied
        """
        # Find pixels with multiple class overlaps (sum > 1 across class dimension)
        class_count = np.sum(mask_tensor > 0, axis=2)
        overlap_mask = class_count > 1

        if not np.any(overlap_mask):
            # No overlapping pixels, return original
            return mask_tensor.copy()

        # Create output array
        prioritized_mask = mask_tensor.copy()

        # For overlapping pixels, find the priority class
        # We need to find argmin or argmax of non-zero classes
        # Use masking: set zero classes to a very high or low value for argmin/argmax

        if ascending:
            # For ascending priority (lower class index wins):
            # Replace 0s with num_classes (high value) so argmin finds lowest non-zero
            num_classes = mask_tensor.shape[2]
            # Create class index array: [0, 1, 2, ..., num_classes-1]
            class_indices = np.arange(num_classes)
            # For each pixel, find the minimum class index where mask > 0
            # Mask out zeros by setting them to num_classes (larger than any valid index)
            masked = np.where(mask_tensor > 0, class_indices, num_classes)
            priority_class = np.argmin(masked, axis=2)
        else:
            # For descending priority (higher class index wins):
            # Replace 0s with -1 (low value) so argmax finds highest non-zero
            class_indices = np.arange(mask_tensor.shape[2])
            masked = np.where(mask_tensor > 0, class_indices, -1)
            priority_class = np.argmax(masked, axis=2)

        # Get coordinates of overlapping pixels
        overlap_y, overlap_x = np.where(overlap_mask)

        # Zero out all classes at overlapping pixels
        prioritized_mask[overlap_y, overlap_x, :] = 0

        # Set only the priority class to 1 at overlapping pixels
        priority_classes_at_overlap = priority_class[overlap_y, overlap_x]
        prioritized_mask[overlap_y, overlap_x, priority_classes_at_overlap] = 1

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
        self,
        erase_vertices: list[QPointF],
        image_size: tuple[int, int],
        viewer_index: int | None = None,
    ) -> list[int]:
        """Erase segments that overlap with the given shape.

        Args:
            erase_vertices: Vertices of the erase shape
            image_size: Size of the image (height, width)
            viewer_index: Viewer index for multi-view segments (optional)

        Returns:
            List of indices of segments that were removed
        """
        if not erase_vertices or not self.segments:
            return [], []

        # Create mask from erase shape
        erase_mask = self.rasterize_polygon(erase_vertices, image_size)
        if erase_mask is None:
            return [], []

        return self.erase_segments_with_mask(erase_mask, image_size, viewer_index)

    def erase_segments_with_mask(
        self,
        erase_mask: np.ndarray,
        image_size: tuple[int, int],
        viewer_index: int | None = None,
    ) -> list[int]:
        """Erase overlapping pixels from segments that overlap with the given mask.

        Args:
            erase_mask: Binary mask indicating pixels to erase
            image_size: Size of the image (height, width)
            viewer_index: Viewer index for multi-view segments (optional)

        Returns:
            List of indices of segments that were modified or removed
        """
        if erase_mask is None or not self.segments:
            return [], []

        if viewer_index is not None:
            # Handle multi-view case - only modify viewer-specific data
            return self._erase_segments_multi_view_aware(
                erase_mask, image_size, viewer_index
            )
        else:
            # Handle single-view case (legacy)
            return self._erase_segments_single_view(erase_mask, image_size)

    def _erase_segments_multi_view_aware(
        self, erase_mask: np.ndarray, image_size: tuple[int, int], viewer_index: int
    ) -> list[int]:
        """Erase segments with mirrored operation across all viewers in multi-view segments."""
        modified_indices = []
        segments_to_remove = []
        segments_to_add = []
        removed_segments_data = []

        # Process each segment
        for i, segment in enumerate(self.segments):
            segment_mask = self._get_segment_mask(segment, image_size, viewer_index)
            if segment_mask is None:
                continue

            # Ensure masks have the same dimensions (backward compat for old NPZ files)
            if segment_mask.shape != erase_mask.shape:
                segment_mask = cv2.resize(
                    segment_mask.astype(np.uint8),
                    (erase_mask.shape[1], erase_mask.shape[0]),
                    interpolation=cv2.INTER_NEAREST,
                ).astype(bool)

            # Check for overlap
            overlap = np.logical_and(erase_mask, segment_mask)
            overlap_area = np.sum(overlap)

            if overlap_area > 0:
                modified_indices.append(i)
                removed_segments_data.append({"index": i, "segment": segment.copy()})

                # Always mark for removal - we'll recreate what's needed
                segments_to_remove.append(i)

                # Create new mask by removing erased pixels
                new_mask = np.logical_and(segment_mask, ~erase_mask)
                remaining_area = np.sum(new_mask)

                if "views" in segment:
                    # Multi-view segment: mirror erase operation to ALL viewers
                    if remaining_area > 0:
                        # Some pixels remain: create split segments for ALL viewers
                        split_segments = self._split_mask_into_components(
                            new_mask, segment.get("class_id"), segment, viewer_index
                        )

                        # Apply the same erase pattern to all viewers' data
                        for split_segment in split_segments:
                            final_segment = split_segment.copy()

                            # Mirror the erase operation to all other viewers
                            mirrored_views = {}
                            for view_id, view_data in segment["views"].items():
                                if view_id == viewer_index:
                                    # Keep the erased result for the source viewer
                                    mirrored_views[view_id] = final_segment["views"][
                                        view_id
                                    ]
                                else:
                                    # Apply same erase pattern to other viewers
                                    mirrored_views[view_id] = self._apply_erase_to_view(
                                        view_data, erase_mask, image_size
                                    )

                            final_segment["views"] = mirrored_views
                            segments_to_add.append(final_segment)
                    # If remaining_area == 0, all pixels erased - segment completely removed from all viewers
                else:
                    # Single-view segment: handle normally
                    if remaining_area > 0:
                        split_segments = self._split_mask_into_components(
                            new_mask, segment.get("class_id"), segment, None
                        )
                        segments_to_add.extend(split_segments)
                    # If remaining_area == 0, segment is completely removed

        # Remove affected segments
        for i in sorted(segments_to_remove, reverse=True):
            del self.segments[i]

        # Add new/modified segments
        for new_segment in segments_to_add:
            self.segments.append(new_segment)

        if modified_indices:
            self._update_next_class_id()

        return modified_indices, removed_segments_data

    def _apply_erase_to_view(
        self, view_data: dict, erase_mask: np.ndarray, image_size: tuple[int, int]
    ) -> dict:
        """Apply the same erase pattern to another viewer's data."""
        if "vertices" in view_data and view_data["vertices"]:
            # For polygon-based segments, create a mask and apply erase
            vertices_as_points = [QPointF(v[0], v[1]) for v in view_data["vertices"]]
            view_mask = self.rasterize_polygon(vertices_as_points, image_size)
            if view_mask is None:
                return view_data  # Return original if mask creation fails

            # Ensure mask dimensions match (backward compat for old NPZ files)
            if view_mask.shape != erase_mask.shape:
                view_mask = cv2.resize(
                    view_mask.astype(np.uint8),
                    (erase_mask.shape[1], erase_mask.shape[0]),
                    interpolation=cv2.INTER_NEAREST,
                ).astype(bool)

            # Apply erase operation
            new_mask = np.logical_and(view_mask, ~erase_mask)

            # Convert back to vertices if any pixels remain
            if np.sum(new_mask) > 0:
                # Find contours and convert back to vertices
                contours, _ = cv2.findContours(
                    new_mask.astype(np.uint8),
                    cv2.RETR_EXTERNAL,
                    cv2.CHAIN_APPROX_SIMPLE,
                )
                if contours:
                    # Use the largest contour
                    largest_contour = max(contours, key=cv2.contourArea)
                    new_vertices = [
                        [int(point[0][0]), int(point[0][1])]
                        for point in largest_contour
                    ]
                    return {"vertices": new_vertices, "mask": None}

            # If no pixels remain, return empty
            return {"vertices": [], "mask": None}

        elif "mask" in view_data and view_data["mask"] is not None:
            # For mask-based segments, apply erase directly
            view_mask = view_data["mask"]

            # Ensure mask dimensions match (backward compat for old NPZ files)
            if view_mask.shape != erase_mask.shape:
                view_mask = cv2.resize(
                    view_mask.astype(np.uint8),
                    (erase_mask.shape[1], erase_mask.shape[0]),
                    interpolation=cv2.INTER_NEAREST,
                ).astype(bool)

            # Apply erase operation
            new_mask = np.logical_and(view_mask, ~erase_mask)
            return {"vertices": None, "mask": new_mask}

        # Fallback: return original data if we can't process it
        return view_data

    def _erase_segments_single_view(
        self, erase_mask: np.ndarray, image_size: tuple[int, int]
    ) -> list[int]:
        """Handle single-view erase (legacy behavior)."""
        modified_indices = []
        segments_to_remove = []
        segments_to_add = []
        removed_segments_data = []

        # Iterate through all segments to find overlaps
        for i, segment in enumerate(self.segments):
            segment_mask = self._get_segment_mask(
                segment, image_size, viewer_index=None
            )
            if segment_mask is None:
                continue

            # Ensure masks have the same dimensions (backward compat for old NPZ files)
            if segment_mask.shape != erase_mask.shape:
                segment_mask = cv2.resize(
                    segment_mask.astype(np.uint8),
                    (erase_mask.shape[1], erase_mask.shape[0]),
                    interpolation=cv2.INTER_NEAREST,
                ).astype(bool)

            # Check for overlap
            overlap = np.logical_and(erase_mask, segment_mask)
            overlap_area = np.sum(overlap)

            if overlap_area > 0:
                modified_indices.append(i)
                removed_segments_data.append({"index": i, "segment": segment.copy()})

                # Create new mask by removing erased pixels
                new_mask = np.logical_and(segment_mask, ~erase_mask)
                remaining_area = np.sum(new_mask)

                if remaining_area == 0:
                    # All pixels were erased, remove segment entirely
                    segments_to_remove.append(i)
                else:
                    # Some pixels remain, check for disconnected components
                    connected_segments = self._split_mask_into_components(
                        new_mask, segment.get("class_id"), segment, viewer_index=None
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
        self,
        segment: dict[str, Any],
        image_size: tuple[int, int],
        viewer_index: int | None = None,
    ) -> np.ndarray | None:
        """Get binary mask for a segment.

        Args:
            segment: Segment data
            image_size: Size of the image (height, width)
            viewer_index: Viewer index for multi-view segments (optional)

        Returns:
            Binary mask for the segment or None if unable to create
        """
        # Handle multi-view format with "views" structure
        if "views" in segment and viewer_index is not None:
            if viewer_index not in segment["views"]:
                return None  # This segment doesn't exist in this viewer

            view_data = segment["views"][viewer_index]
            if segment.get("type") == "Polygon" and "vertices" in view_data:
                # Convert stored list of lists back to QPointF objects for rasterization
                qpoints = [QPointF(p[0], p[1]) for p in view_data["vertices"]]
                return self.rasterize_polygon(qpoints, image_size)
            elif "mask" in view_data and view_data["mask"] is not None:
                return view_data["mask"]
            return None

        # Handle legacy single-view format
        if segment.get("type") == "Polygon" and "vertices" in segment:
            # Convert stored list of lists back to QPointF objects for rasterization
            qpoints = [QPointF(p[0], p[1]) for p in segment["vertices"]]
            return self.rasterize_polygon(qpoints, image_size)
        elif "mask" in segment and segment["mask"] is not None:
            return segment["mask"]
        return None

    def _split_mask_into_components(
        self,
        mask: np.ndarray,
        class_id: int | None,
        original_segment: dict[str, Any] | None = None,
        viewer_index: int | None = None,
    ) -> list[dict[str, Any]]:
        """Split a mask into separate segments for each connected component.

        Args:
            mask: Binary mask to split
            class_id: Class ID to assign to all resulting segments
            original_segment: Original segment being split (for multi-view format)
            viewer_index: Viewer index for multi-view segments

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
                # Handle multi-view format
                if (
                    original_segment
                    and "views" in original_segment
                    and viewer_index is not None
                ):
                    # Create multi-view segment with same structure as original
                    new_segment = {
                        "type": "AI",  # Convert to mask-based segment
                        "class_id": class_id,
                        "views": {
                            viewer_index: {
                                "mask": component_mask,
                                "vertices": None,
                            }
                        },
                    }
                else:
                    # Legacy single-view format
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

    def convert_ai_segments_to_polygons(
        self, epsilon_factor: float = 0.001
    ) -> tuple[int, int]:
        """Convert all live AI segments to polygon segments.

        Only converts segments with type="AI" (live AI segments).
        Does NOT convert:
        - type="Loaded" (masks loaded from NPZ files)
        - type="Polygon" (already polygons)

        Args:
            epsilon_factor: Controls polygon simplification. Higher values
                create simpler polygons with fewer points. Typical range: 0.0005-0.005.
                Default 0.001 gives a good balance of accuracy and simplicity.

        Returns:
            Tuple of (converted_count, skipped_count)
        """
        converted_count = 0
        skipped_count = 0

        # Process segments in place
        for i, segment in enumerate(self.segments):
            seg_type = segment.get("type", "")

            # Only convert live AI segments
            if seg_type != "AI":
                if seg_type == "Loaded":
                    skipped_count += 1
                continue

            # Handle multi-view segments
            if "views" in segment:
                converted_views = {}
                all_views_converted = True

                for view_id, view_data in segment["views"].items():
                    mask = view_data.get("mask")
                    if mask is None:
                        all_views_converted = False
                        continue

                    vertices = self._mask_to_polygon_vertices(mask, epsilon_factor)
                    if vertices is not None and len(vertices) >= 3:
                        converted_views[view_id] = {
                            "vertices": vertices,
                            "mask": None,
                        }
                    else:
                        all_views_converted = False

                if all_views_converted and converted_views:
                    # Update segment to polygon type
                    self.segments[i] = {
                        "type": "Polygon",
                        "class_id": segment.get("class_id"),
                        "views": converted_views,
                    }
                    converted_count += 1

            else:
                # Handle single-view (legacy) segments
                mask = segment.get("mask")
                if mask is None:
                    continue

                vertices = self._mask_to_polygon_vertices(mask, epsilon_factor)
                if vertices is not None and len(vertices) >= 3:
                    # Replace AI segment with polygon segment
                    self.segments[i] = {
                        "type": "Polygon",
                        "vertices": vertices,
                        "mask": None,
                        "class_id": segment.get("class_id"),
                    }
                    converted_count += 1

        return converted_count, skipped_count

    def _mask_to_polygon_vertices(
        self, mask: np.ndarray, epsilon_factor: float = 0.001
    ) -> list[list[int]] | None:
        """Convert a binary mask to polygon vertices.

        Uses contour detection and polygon approximation to create
        a simplified polygon from the mask.

        Args:
            mask: Binary mask (boolean numpy array)
            epsilon_factor: Controls polygon simplification (0.0005-0.005 typical)

        Returns:
            List of [x, y] vertex coordinates, or None if conversion fails
        """
        if mask is None or np.sum(mask) == 0:
            return None

        # Convert boolean mask to uint8
        mask_uint8 = (mask * 255).astype(np.uint8)

        # Find contours
        contours, _ = cv2.findContours(
            mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        if not contours:
            return None

        # Use the largest contour (by area)
        largest_contour = max(contours, key=cv2.contourArea)

        # Calculate epsilon for polygon approximation
        # Larger epsilon = fewer points = simpler polygon
        arc_length = cv2.arcLength(largest_contour, closed=True)
        epsilon = epsilon_factor * arc_length

        # Approximate the contour as a polygon
        approx_polygon = cv2.approxPolyDP(largest_contour, epsilon, closed=True)

        # Convert to list of [x, y] coordinates
        vertices = [[int(point[0][0]), int(point[0][1])] for point in approx_polygon]

        # Ensure we have at least 3 vertices for a valid polygon
        if len(vertices) < 3:
            return None

        return vertices
