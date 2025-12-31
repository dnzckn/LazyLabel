"""Keyboard event manager for handling keyboard shortcuts and key presses.

This manager handles:
- Escape key (cancel operations, clear state)
- Space key (finalize/accept segments)
- Shift+Space key (erase mode)
- Enter key (save output)
- Merge key (assign to class)
- Clear all points operation
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from ...utils.logger import logger

if TYPE_CHECKING:
    from ..main_window import MainWindow


class KeyboardEventManager:
    """Manages keyboard event handling for the main window.

    This class consolidates keyboard event routing including:
    - Mode-specific key handling
    - Single-view vs multi-view dispatch
    - Point and polygon clearing
    """

    def __init__(self, main_window: MainWindow):
        """Initialize the keyboard event manager.

        Args:
            main_window: Parent MainWindow instance
        """
        self.mw = main_window

    @property
    def viewer(self):
        """Get the active viewer (supports sequence mode)."""
        return self.mw.active_viewer

    def handle_escape_press(self) -> None:
        """Handle escape key press - cancel operations and clear state."""
        # Clear selections based on view mode
        if self.mw.view_mode == "multi":
            # Clear multi-view segment table selections
            if hasattr(self.mw, "multi_view_segment_tables"):
                for table in self.mw.multi_view_segment_tables:
                    table.clearSelection()
            # Also clear any highlights in multi-view
            if hasattr(self.mw, "_clear_multi_view_highlights"):
                for viewer_idx in range(len(self.mw.multi_view_viewers)):
                    self.mw._clear_multi_view_highlights(viewer_idx)
        else:
            self.mw.right_panel.clear_selections()

        self.clear_all_points()

        # Clear bounding box preview state if active
        if (
            hasattr(self.mw, "ai_bbox_preview_mask")
            and self.mw.ai_bbox_preview_mask is not None
        ):
            self.mw.ai_bbox_preview_mask = None
            self.mw.ai_bbox_preview_rect = None

            # Clear preview
            if hasattr(self.mw, "preview_mask_item") and self.mw.preview_mask_item:
                self.viewer.scene().removeItem(self.mw.preview_mask_item)
                self.mw.preview_mask_item = None

        # Set focus to appropriate viewer
        if self.mw.view_mode == "multi" and hasattr(self.mw, "multi_view_viewers"):
            active_idx = 0
            if (
                hasattr(self.mw, "multi_view_coordinator")
                and self.mw.multi_view_coordinator
            ):
                active_idx = self.mw.multi_view_coordinator.active_viewer_idx
            if active_idx < len(self.mw.multi_view_viewers):
                self.mw.multi_view_viewers[active_idx].setFocus()
        else:
            self.viewer.setFocus()

    def handle_space_press(self) -> None:
        """Handle space key press - finalize/accept current segment."""
        logger.debug(
            f"Space pressed - mode: {self.mw.mode}, view_mode: {self.mw.view_mode}"
        )

        if self.mw.mode == "polygon":
            if self.mw.view_mode == "single" and self.mw.polygon_points:
                self.mw._finalize_polygon(erase_mode=False)
            elif self.mw.view_mode == "sequence" and self.mw.polygon_points:
                # Sequence mode uses same logic as single view
                self.mw._finalize_polygon(erase_mode=False)
            elif self.mw.view_mode == "multi" and hasattr(
                self.mw, "multi_view_polygon_points"
            ):
                # Determine shared class_id for linked mode
                shared_class_id = None
                if (
                    hasattr(self.mw, "multi_view_coordinator")
                    and self.mw.multi_view_coordinator
                    and self.mw.multi_view_coordinator.is_linked
                ):
                    # Use first viewer with points to determine class_id
                    for i, points in enumerate(self.mw.multi_view_polygon_points):
                        if points and len(points) >= 3:
                            segment_manager = self.mw.multi_view_segment_managers[i]
                            shared_class_id = segment_manager.active_class_id
                            if shared_class_id is None:
                                shared_class_id = segment_manager.next_class_id
                            break

                # Complete polygons for all viewers that have points
                for i, points in enumerate(self.mw.multi_view_polygon_points):
                    if points and len(points) >= 3:
                        self.mw._finalize_multi_view_polygon(
                            i, erase_mode=False, shared_class_id=shared_class_id
                        )
        elif self.mw.mode == "ai":
            # For AI mode, use accept method (normal mode)
            if self.mw.view_mode == "single":
                self.mw._accept_ai_segment(erase_mode=False)
            elif self.mw.view_mode == "sequence":
                # Sequence mode uses same logic as single view
                self.mw._accept_ai_segment(erase_mode=False)
            elif self.mw.view_mode == "multi":
                # Handle multi-view AI acceptance (normal mode)
                if (
                    hasattr(self.mw, "multi_view_mode_handler")
                    and self.mw.multi_view_mode_handler
                ):
                    self.mw.multi_view_mode_handler.save_ai_predictions()
                    self.mw._show_notification("AI segment(s) accepted")
                else:
                    self.mw._accept_ai_segment(erase_mode=False)
        else:
            # For other modes, save current segment
            self.mw._save_current_segment()

    def handle_shift_space_press(self) -> None:
        """Handle Shift+Space key press for erase functionality."""
        logger.debug(
            f"Shift+Space pressed - mode: {self.mw.mode}, view_mode: {self.mw.view_mode}"
        )

        if self.mw.mode == "polygon":
            if self.mw.view_mode == "single" and self.mw.polygon_points:
                self.mw._finalize_polygon(erase_mode=True)
            elif self.mw.view_mode == "sequence" and self.mw.polygon_points:
                # Sequence mode uses same logic as single view
                self.mw._finalize_polygon(erase_mode=True)
            elif self.mw.view_mode == "multi" and hasattr(
                self.mw, "multi_view_polygon_points"
            ):
                # Complete polygons for all viewers that have points with erase mode
                for i, points in enumerate(self.mw.multi_view_polygon_points):
                    if points and len(points) >= 3:
                        self.mw._finalize_multi_view_polygon(i, erase_mode=True)
        elif self.mw.mode == "ai":
            # For AI mode, use accept method with erase mode
            if self.mw.view_mode == "single":
                self.mw._accept_ai_segment(erase_mode=True)
            elif self.mw.view_mode == "sequence":
                # Sequence mode uses same logic as single view
                self.mw._accept_ai_segment(erase_mode=True)
            elif self.mw.view_mode == "multi":
                # Handle multi-view AI acceptance with erase mode
                if (
                    hasattr(self.mw, "multi_view_mode_handler")
                    and self.mw.multi_view_mode_handler
                ):
                    self.mw.multi_view_mode_handler.erase_ai_predictions()
                    logger.debug("Shift+Space pressed - multi-view AI erase applied")
                else:
                    self.mw._accept_ai_segment(erase_mode=True)
        else:
            # For other modes, show notification that erase isn't available
            self.mw._show_notification(
                f"Erase mode not available in {self.mw.mode} mode"
            )

    def handle_enter_press(self) -> None:
        """Handle enter key press - save output."""
        logger.debug(
            f"Enter pressed - mode: {self.mw.mode}, view_mode: {self.mw.view_mode}"
        )

        if self.mw.mode == "polygon":
            logger.debug(
                f"Polygon mode - polygon_points: "
                f"{len(self.mw.polygon_points) if hasattr(self.mw, 'polygon_points') and self.mw.polygon_points else 0}"
            )
            if self.mw.view_mode == "single":
                # If there are pending polygon points, finalize them first
                if self.mw.polygon_points:
                    logger.debug("Finalizing pending polygon")
                    self.mw._finalize_polygon()
                # Always save after handling pending work
                logger.debug("Saving polygon segments to NPZ")
                self.mw._save_output_to_npz()
            elif self.mw.view_mode == "multi":
                # Complete polygons for all viewers that have points
                if hasattr(self.mw, "multi_view_polygon_points"):
                    # Determine shared class_id for linked mode
                    shared_class_id = None
                    if (
                        hasattr(self.mw, "multi_view_coordinator")
                        and self.mw.multi_view_coordinator
                        and self.mw.multi_view_coordinator.is_linked
                    ):
                        for i, points in enumerate(self.mw.multi_view_polygon_points):
                            if points and len(points) >= 3:
                                segment_manager = self.mw.multi_view_segment_managers[i]
                                shared_class_id = segment_manager.active_class_id
                                if shared_class_id is None:
                                    shared_class_id = segment_manager.next_class_id
                                break

                    for i, points in enumerate(self.mw.multi_view_polygon_points):
                        if points and len(points) >= 3:
                            self.mw._finalize_multi_view_polygon(
                                i, erase_mode=False, shared_class_id=shared_class_id
                            )
                # Always save after handling pending work
                self.mw._save_output_to_npz()
        else:
            # First accept any AI segments (same as spacebar), then save
            self.mw._accept_ai_segment()
            self.mw._save_output_to_npz()

    def handle_merge_press(self) -> None:
        """Handle merge key press - assign selected segments to active class."""
        self.mw._assign_selected_to_class()
        self.mw.right_panel.clear_selections()

    def clear_all_points(self) -> None:
        """Clear all temporary points - works in single, sequence, and multi-view mode."""
        if self.mw.view_mode in ("single", "sequence"):
            self._clear_single_view_points()
        elif self.mw.view_mode == "multi":
            self._clear_multi_view_points()

    def _clear_single_view_points(self) -> None:
        """Clear all points and previews in single-view and sequence mode."""
        # Clear rubber band line
        if hasattr(self.mw, "rubber_band_line") and self.mw.rubber_band_line:
            self.viewer.scene().removeItem(self.mw.rubber_band_line)
            self.mw.rubber_band_line = None

        # Clear positive/negative points
        self.mw.positive_points.clear()
        self.mw.negative_points.clear()

        # Clear point items from scene
        for item in self.mw.point_items:
            self.viewer.scene().removeItem(item)
        self.mw.point_items.clear()

        # Clear polygon points and preview items
        self.mw.polygon_points.clear()
        for item in self.mw.polygon_preview_items:
            self.viewer.scene().removeItem(item)
        self.mw.polygon_preview_items.clear()

        # Clear preview mask
        if hasattr(self.mw, "preview_mask_item") and self.mw.preview_mask_item:
            self.viewer.scene().removeItem(self.mw.preview_mask_item)
            self.mw.preview_mask_item = None

        # Also clear the stored preview mask
        if hasattr(self.mw, "current_preview_mask"):
            self.mw.current_preview_mask = None

    def _clear_multi_view_points(self) -> None:
        """Clear all points and previews in multi-view mode."""
        # Clear AI previews and points
        if hasattr(self.mw, "_clear_multi_view_previews"):
            self.mw._clear_multi_view_previews()

        # Clear polygon points for all viewers
        if hasattr(self.mw, "multi_view_polygon_points"):
            for viewer_idx in range(len(self.mw.multi_view_polygon_points)):
                self.mw.multi_view_polygon_points[viewer_idx] = []

        # Clear polygon preview items from scenes
        if hasattr(self.mw, "multi_view_polygon_preview_items"):
            for viewer_idx, items in self.mw.multi_view_polygon_preview_items.items():
                if viewer_idx < len(self.mw.multi_view_viewers):
                    viewer = self.mw.multi_view_viewers[viewer_idx]
                    for item in items:
                        if item.scene():
                            viewer.scene().removeItem(item)
                    self.mw.multi_view_polygon_preview_items[viewer_idx] = []

        # Clear rubber band lines for polygon mode
        if hasattr(self.mw, "multi_view_rubber_band_lines"):
            for viewer_idx, line in self.mw.multi_view_rubber_band_lines.items():
                if (
                    line
                    and line.scene()
                    and viewer_idx < len(self.mw.multi_view_viewers)
                ):
                    self.mw.multi_view_viewers[viewer_idx].scene().removeItem(line)
                self.mw.multi_view_rubber_band_lines[viewer_idx] = None
