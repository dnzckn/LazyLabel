"""AI segment manager for handling SAM-based segmentation operations.

This manager handles:
- AI segment acceptance and creation
- Point-based and bounding box predictions
- Preview mask management
- Erase mode for AI segments
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QBrush, QColor, QPen
from PyQt6.QtWidgets import QGraphicsEllipseItem

from ...utils import mask_to_pixmap
from ...utils.logger import logger

if TYPE_CHECKING:
    from PyQt6.QtCore import QPointF

    from ...core.segment_manager import SegmentManager
    from ...core.undo_redo_manager import UndoRedoManager
    from ...models.model_manager import ModelManager
    from ..main_window import MainWindow
    from ..photo_viewer import PhotoViewer


class AISegmentManager:
    """Manages AI/SAM segment operations.

    This class consolidates all AI segment handling including:
    - Segment acceptance (spacebar handler)
    - Point addition and tracking
    - Segmentation preview updates
    - Auto-polygon conversion
    - Erase mode handling
    """

    def __init__(self, main_window: MainWindow):
        """Initialize the AI segment manager.

        Args:
            main_window: Parent MainWindow instance
        """
        self.mw = main_window

    # ========== Property Accessors ==========

    @property
    def viewer(self) -> PhotoViewer:
        """Get viewer from main window."""
        return self.mw.viewer

    @property
    def segment_manager(self) -> SegmentManager:
        """Get segment manager from main window."""
        return self.mw.segment_manager

    @property
    def model_manager(self) -> ModelManager:
        """Get model manager from main window."""
        return self.mw.model_manager

    @property
    def undo_redo_manager(self) -> UndoRedoManager:
        """Get undo/redo manager from main window."""
        return self.mw.undo_redo_manager

    # ========== Main Accept Handler ==========

    def accept_ai_segment(self, erase_mode: bool = False) -> None:
        """Accept the current AI segment preview (spacebar handler).

        Args:
            erase_mode: If True, erase overlapping segments instead of adding
        """
        logger.debug(
            f"accept_ai_segment called - view_mode: {self.mw.view_mode}, "
            f"erase_mode: {erase_mode}"
        )

        if self.mw.view_mode == "single":
            self._accept_single_view(erase_mode)
        elif self.mw.view_mode == "multi":
            self._accept_multi_view(erase_mode)

    def _accept_single_view(self, erase_mode: bool) -> None:
        """Accept AI segment in single view mode.

        Args:
            erase_mode: If True, erase overlapping segments
        """
        has_preview_item = (
            hasattr(self.mw, "preview_mask_item") and self.mw.preview_mask_item
        )
        has_preview_mask = (
            hasattr(self.mw, "current_preview_mask")
            and self.mw.current_preview_mask is not None
        )
        has_bbox_preview = (
            hasattr(self.mw, "ai_bbox_preview_mask")
            and self.mw.ai_bbox_preview_mask is not None
        )

        logger.debug(
            f"Single view - has_preview_item: {has_preview_item}, "
            f"has_preview_mask: {has_preview_mask}, has_bbox_preview: {has_bbox_preview}"
        )

        # Handle bbox preview first
        if has_bbox_preview:
            self._accept_bbox_preview(erase_mode, has_preview_item)
        elif has_preview_item and has_preview_mask:
            self._accept_point_preview(erase_mode, has_preview_item)
        else:
            # No AI preview found
            if erase_mode:
                logger.debug("No AI segment preview to erase")
                self.mw._show_notification("No AI segment preview to erase")
            else:
                logger.debug("No AI segment preview to accept")
                self.mw._show_notification("No AI segment preview to accept")

    def _accept_bbox_preview(self, erase_mode: bool, has_preview_item: bool) -> None:
        """Accept bounding box preview.

        Args:
            erase_mode: If True, erase overlapping segments
            has_preview_item: Whether a preview item exists
        """
        filtered_mask = self.mw._apply_fragment_threshold(self.mw.ai_bbox_preview_mask)
        if filtered_mask is not None:
            if erase_mode:
                self._erase_with_mask(filtered_mask, "bbox")
            else:
                self._create_segment_from_mask(filtered_mask, "bbox")

            # Clear the bbox preview
            self.mw.ai_bbox_preview_mask = None
            self.mw.ai_bbox_preview_rect = None

            # Clear preview
            if has_preview_item:
                self.viewer.scene().removeItem(self.mw.preview_mask_item)
                self.mw.preview_mask_item = None

            # Clear all points
            self.mw.clear_all_points()

            # Update display
            if erase_mode:
                self.mw._update_all_lists()
            else:
                self.mw._update_lists_incremental(
                    added_segment_index=len(self.segment_manager.segments) - 1
                )
        else:
            self.mw._show_warning_notification(
                "All segments filtered out by fragment threshold"
            )

    def _accept_point_preview(self, erase_mode: bool, has_preview_item: bool) -> None:
        """Accept point-based preview.

        Args:
            erase_mode: If True, erase overlapping segments
            has_preview_item: Whether a preview item exists
        """
        filtered_mask = self.mw._apply_fragment_threshold(self.mw.current_preview_mask)
        if filtered_mask is not None:
            if erase_mode:
                self._erase_with_mask(filtered_mask, "point")
            else:
                self._create_segment_from_mask(filtered_mask, "point")

            # Clear all points after accepting
            self.mw.clear_all_points()

            # Update display
            if erase_mode:
                self.mw._update_all_lists()
            else:
                self.mw._update_lists_incremental(
                    added_segment_index=len(self.segment_manager.segments) - 1
                )
        else:
            self.mw._show_warning_notification(
                "All segments filtered out by fragment threshold"
            )
            # Only clear preview if we didn't accept
            if has_preview_item and self.mw.preview_mask_item.scene():
                self.viewer.scene().removeItem(self.mw.preview_mask_item)
            self.mw.preview_mask_item = None
            self.mw.current_preview_mask = None

    def _erase_with_mask(self, mask, source: str) -> None:
        """Erase segments overlapping with the given mask.

        Args:
            mask: The mask to use for erasing
            source: Source type ("bbox" or "point")
        """
        logger.debug(f"Erase mode active for {source} preview - applying eraser")
        image_height = self.viewer._pixmap_item.pixmap().height()
        image_width = self.viewer._pixmap_item.pixmap().width()
        image_size = (image_height, image_width)

        removed_indices, removed_segments_data = (
            self.segment_manager.erase_segments_with_mask(mask, image_size)
        )
        logger.debug(
            f"{source} erase completed - modified {len(removed_indices)} segments"
        )

        if removed_indices:
            self.undo_redo_manager.record_action(
                {
                    "type": "erase_segments",
                    "removed_segments": removed_segments_data,
                }
            )
            # Clear pixmap caches - segments were modified/split
            self.mw.segment_display_manager.clear_pixmap_caches()
            self.mw._show_success_notification(
                f"Erased {len(removed_indices)} segment(s)!"
            )
        else:
            self.mw._show_notification("No segments to erase")

    def _create_segment_from_mask(self, mask, source: str) -> None:
        """Create a segment from the given mask.

        Args:
            mask: The mask to create segment from
            source: Source type ("bbox" or "point")
        """
        # Use helper method to auto-convert to polygon if enabled
        new_segment = self.mw._create_segment_from_mask(mask)
        self.segment_manager.add_segment(new_segment)

        self.undo_redo_manager.record_action(
            {
                "type": "add_segment",
                "segment_index": len(self.segment_manager.segments) - 1,
            }
        )

        seg_type = "polygon" if new_segment["type"] == "Polygon" else "AI"
        if source == "bbox":
            self.mw._show_success_notification(
                f"AI bounding box segment saved as {seg_type}!"
            )
        else:
            self.mw._show_notification(f"Segment saved as {seg_type}")

    def _accept_multi_view(self, erase_mode: bool) -> None:
        """Accept AI segment in multi-view mode.

        Args:
            erase_mode: If True, erase overlapping segments
        """
        if (
            not hasattr(self.mw, "multi_view_coordinator")
            or not self.mw.multi_view_coordinator
        ):
            logger.debug("No multi_view_coordinator available")
            return

        # Get target viewers (both if linked, just active if unlinked)
        target_viewers = self.mw.multi_view_coordinator.get_target_viewers()
        logger.debug(
            f"_accept_multi_view: target_viewers={target_viewers}, erase_mode={erase_mode}"
        )
        processed_count = 0

        for viewer_idx in target_viewers:
            mask = self.mw.multi_view_coordinator.get_preview_mask(viewer_idx)
            logger.debug(
                f"Viewer {viewer_idx}: mask is {'None' if mask is None else f'present with {mask.sum()} pixels'}"
            )
            if mask is None:
                continue

            # Apply fragment threshold
            filtered_mask = self.mw._apply_fragment_threshold(mask)
            if (
                filtered_mask is None
                or not hasattr(filtered_mask, "any")
                or not filtered_mask.any()
            ):
                continue

            # Get the segment manager for this viewer
            segment_manager = self.mw.multi_view_segment_managers[viewer_idx]

            if erase_mode:
                # Erase segments with this mask
                viewer = self.mw.multi_view_viewers[viewer_idx]
                pixmap = viewer._pixmap_item.pixmap()
                image_size = (pixmap.height(), pixmap.width())

                removed_indices, removed_segments_data = (
                    segment_manager.erase_segments_with_mask(filtered_mask, image_size)
                )

                if removed_indices:
                    self.mw.undo_redo_manager.record_action(
                        {
                            "type": "erase_segments",
                            "viewer_mode": "multi",
                            "viewer_index": viewer_idx,
                            "removed_segments": removed_segments_data,
                        }
                    )
                    processed_count += 1
            else:
                # Add segment - use _create_segment_from_mask for auto-polygon conversion
                new_segment = self.mw._create_segment_from_mask(filtered_mask)

                # Override class_id for this viewer's segment manager
                class_id = segment_manager.active_class_id
                if class_id is None:
                    class_id = segment_manager.next_class_id
                new_segment["class_id"] = class_id

                segment_manager.add_segment(new_segment)

                self.mw.undo_redo_manager.record_action(
                    {
                        "type": "add_segment",
                        "viewer_mode": "multi",
                        "viewer_index": viewer_idx,
                        "segment_index": len(segment_manager.segments) - 1,
                    }
                )
                processed_count += 1

            # Update display for this viewer
            self.mw._update_multi_view_segment_table(viewer_idx)
            self.mw._display_multi_view_segments(viewer_idx)

        # Clear previews and points
        self.mw._clear_multi_view_previews()

        if processed_count > 0:
            if erase_mode:
                self.mw._show_success_notification(
                    f"Erased segments in {processed_count} viewer(s)"
                )
            else:
                self.mw._show_success_notification(
                    f"Saved predictions to {processed_count} viewer(s)"
                )
        else:
            if erase_mode:
                self.mw._show_notification("No segments to erase")
            else:
                self.mw._show_notification("No AI segment preview to accept")

    def add_point(
        self, pos: QPointF, positive: bool, update_segmentation: bool = True
    ) -> bool:
        """Add a point for SAM segmentation.

        Args:
            pos: Position of the point
            positive: True for positive point, False for negative
            update_segmentation: Whether to update segmentation preview

        Returns:
            True if point was added successfully
        """
        # Check if model is being initialized
        if self.mw.single_view_model_initializing:
            self.mw._show_notification("AI model is initializing, please wait...", 2000)
            return False

        # Block clicks during SAM updates
        if self.mw.sam_is_updating:
            self.mw._show_warning_notification(
                "AI model is updating, please wait...", 2000
            )
            return False

        # Ensure SAM is updated before using it
        self.mw._ensure_sam_updated()

        # Check again if model initialization started
        if self.mw.single_view_model_initializing:
            self.mw._show_notification("AI model is initializing, please wait...", 2000)
            return False

        if self.mw.sam_is_updating:
            self.mw._show_warning_notification(
                "AI model is updating, please wait...", 2000
            )
            return False

        # Transform coordinates
        sam_x, sam_y = self.mw._transform_display_coords_to_sam_coords(pos)

        point_list = self.mw.positive_points if positive else self.mw.negative_points
        point_list.append([sam_x, sam_y])

        # Create visual point
        point_color = (
            QColor(Qt.GlobalColor.green) if positive else QColor(Qt.GlobalColor.red)
        )
        point_color.setAlpha(150)
        point_diameter = self.mw.point_radius * 2

        point_item = QGraphicsEllipseItem(
            pos.x() - self.mw.point_radius,
            pos.y() - self.mw.point_radius,
            point_diameter,
            point_diameter,
        )
        point_item.setBrush(QBrush(point_color))
        point_item.setPen(QPen(Qt.GlobalColor.transparent))
        self.viewer.scene().addItem(point_item)
        self.mw.point_items.append(point_item)

        # Record for undo
        self.undo_redo_manager.record_action(
            {
                "type": "add_point",
                "point_type": "positive" if positive else "negative",
                "point_coords": [int(pos.x()), int(pos.y())],
                "sam_coords": [sam_x, sam_y],
                "point_item": point_item,
            }
        )

        # Update segmentation if requested
        if update_segmentation and not self.mw.sam_is_updating:
            self.update_segmentation()

        return True

    # ========== Segmentation Update ==========

    def update_segmentation(self) -> None:
        """Update SAM segmentation preview."""
        if hasattr(self.mw, "preview_mask_item") and self.mw.preview_mask_item:
            self.viewer.scene().removeItem(self.mw.preview_mask_item)

        if not self.mw.positive_points or not self.model_manager.is_model_available():
            return

        result = self.model_manager.sam_model.predict(
            self.mw.positive_points, self.mw.negative_points
        )
        if result is not None:
            mask, scores, logits = result

            # Ensure mask is boolean
            if mask.dtype != bool:
                mask = mask > 0.5

            # Scale mask back up to display size if needed
            mask = self.mw.coordinate_transformer.scale_mask_to_display(mask)

            # Store the current mask for potential acceptance
            self.mw.current_preview_mask = mask

            pixmap = mask_to_pixmap(mask, (255, 255, 0))
            self.mw.preview_mask_item = self.viewer.scene().addPixmap(pixmap)
            self.mw.preview_mask_item.setZValue(50)

            self.mw._show_notification("Press spacebar to accept AI segment suggestion")
