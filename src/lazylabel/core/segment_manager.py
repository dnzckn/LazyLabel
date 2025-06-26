"""Segment management functionality."""

import numpy as np
import cv2
from typing import List, Dict, Any, Optional, Tuple
from PyQt6.QtCore import QPointF


class SegmentManager:
    """Manages image segments and classes."""

    def __init__(self):
        self.segments: List[Dict[str, Any]] = []
        self.class_aliases: Dict[int, str] = {}
        self.next_class_id: int = 0
        self.active_class_id: Optional[int] = None  # Currently active/toggled class

    def clear(self) -> None:
        """Clear all segments and reset state."""
        self.segments.clear()
        self.class_aliases.clear()
        self.next_class_id = 0
        self.active_class_id = None

    def add_segment(self, segment_data: Dict[str, Any]) -> None:
        """Add a new segment."""
        if "class_id" not in segment_data:
            # Use active class if available, otherwise use next class ID
            if self.active_class_id is not None:
                segment_data["class_id"] = self.active_class_id
            else:
                segment_data["class_id"] = self.next_class_id
        self.segments.append(segment_data)
        self._update_next_class_id()

    def delete_segments(self, indices: List[int]) -> None:
        """Delete segments by indices."""
        for i in sorted(indices, reverse=True):
            if 0 <= i < len(self.segments):
                del self.segments[i]
        self._update_next_class_id()

    def assign_segments_to_class(self, indices: List[int]) -> None:
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

    def get_unique_class_ids(self) -> List[int]:
        """Get sorted list of unique class IDs."""
        return sorted(
            list(
                {
                    seg.get("class_id")
                    for seg in self.segments
                    if seg.get("class_id") is not None
                }
            )
        )

    def rasterize_polygon(
        self, vertices: List[QPointF], image_size: Tuple[int, int]
    ) -> Optional[np.ndarray]:
        """Convert polygon vertices to binary mask."""
        if not vertices:
            return None

        h, w = image_size
        points_np = np.array([[p.x(), p.y()] for p in vertices], dtype=np.int32)
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.fillPoly(mask, [points_np], 1)
        return mask.astype(bool)

    def create_final_mask_tensor(
        self, image_size: Tuple[int, int], class_order: List[int]
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
                mask = self.rasterize_polygon(seg["vertices"], image_size)
            else:
                mask = seg.get("mask")

            if mask is not None:
                final_mask_tensor[:, :, new_channel_idx] = np.logical_or(
                    final_mask_tensor[:, :, new_channel_idx], mask
                )

        return final_mask_tensor

    def reassign_class_ids(self, new_order: List[int]) -> None:
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

    def set_active_class(self, class_id: Optional[int]) -> None:
        """Set the active class ID."""
        self.active_class_id = class_id

    def get_active_class(self) -> Optional[int]:
        """Get the active class ID."""
        return self.active_class_id

    def toggle_active_class(self, class_id: int) -> bool:
        """Toggle a class as active. Returns True if now active, False if deactivated."""
        if self.active_class_id == class_id:
            self.active_class_id = None
            return False
        else:
            self.active_class_id = class_id
            return True

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
