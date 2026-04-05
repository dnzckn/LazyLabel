"""Save and export manager for handling file output operations.

This manager handles:
- Saving segments via the pluggable exporter framework
- Multi-view output with per-viewer segment filtering
- AI segment saving with fragment threshold filtering
- File deletion for empty segment states
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import TYPE_CHECKING, Any

import cv2
import numpy as np
from PyQt6.QtGui import QPixmap
from PyQt6.QtWidgets import QApplication

from ...core.exporters import (
    ExportContext,
    ExportFormat,
    delete_all_outputs,
    export_all,
)
from ...utils.logger import logger

if TYPE_CHECKING:
    from ...core.segment_manager import SegmentManager
    from ..control_panel import ControlPanel
    from ..main_window import MainWindow
    from .crop_manager import CropManager
    from .file_manager import FileManager


class SaveExportManager:
    """Manages all save and export operations for LazyLabel.

    This class consolidates all file output operations including:
    - NPZ file creation and saving
    - Bounding box TXT file creation and saving
    - Multi-view segment filtering and saving
    - AI segment saving with fragment filtering
    - File cleanup when segments are deleted
    """

    def __init__(self, main_window: MainWindow):
        """Initialize the save/export manager.

        Args:
            main_window: Parent MainWindow instance
        """
        self.mw = main_window

    @property
    def viewer(self):
        """Get the active viewer (supports sequence mode)."""
        return self.mw.active_viewer

    # ========== Property Accessors ==========

    @property
    def segment_manager(self) -> SegmentManager:
        """Get segment manager from main window."""
        return self.mw.segment_manager

    @property
    def file_manager(self) -> FileManager:
        """Get file manager from main window."""
        return self.mw.file_manager

    @property
    def crop_manager(self) -> CropManager:
        """Get crop manager from main window."""
        return self.mw.crop_manager

    @property
    def control_panel(self) -> ControlPanel:
        """Get control panel from main window."""
        return self.mw.control_panel

    # ========== Main Save Entry Points ==========

    def save_output(self) -> None:
        """Save output to NPZ and TXT files based on current view mode.

        This is the main entry point for saving. It handles both single-view
        and multi-view modes, delegating to the appropriate method.
        """
        if self.mw.view_mode == "multi":
            self.save_multi_view_output()
        else:
            self.save_single_view_output()

    def save_single_view_output(self) -> None:
        """Save output via the exporter framework for single-view mode.

        Handles file creation, deletion for empty states, and UI updates.
        """
        if not self.mw.current_image_path:
            self.mw._show_warning_notification("No image loaded.")
            return

        # If no segments, delete associated files
        if not self.segment_manager.segments:
            self._delete_associated_files(self.mw.current_image_path)
            return

        try:
            settings = self.control_panel.get_settings()

            logger.debug(f"Starting save process for: {self.mw.current_image_path}")
            logger.debug(f"Number of segments: {len(self.segment_manager.segments)}")

            ctx = self._build_export_context(self.mw.current_image_path, settings)
            formats = settings.get("export_formats", set())
            if not isinstance(formats, set):
                formats = {ExportFormat(f) for f in formats}

            written = export_all(formats, ctx)

            if written:
                names = ", ".join(os.path.basename(p) for p in written)
                self.mw._show_success_notification(f"Saved: {names}")

            # Update FastFileManager to show checkmarks
            self._update_file_status(self.mw.current_image_path)

        except Exception as e:
            logger.error(f"Error saving file: {str(e)}", exc_info=True)
            self.mw._show_error_notification(f"Error saving: {str(e)}")

    def save_current_ai_segment(self) -> None:
        """Save current SAM segment with fragment threshold filtering."""
        logger.debug(
            f"save_current_ai_segment called - mode: {self.mw.mode}, "
            f"view_mode: {self.mw.view_mode}"
        )

        if self.mw.mode not in ["sam_points", "ai"]:
            logger.debug(f"Mode {self.mw.mode} not in ['sam_points', 'ai'], returning")
            return

        # Handle multi-view mode separately
        if self.mw.view_mode == "multi":
            if hasattr(self.mw, "multi_view_mode_handler"):
                self.mw.multi_view_mode_handler.save_ai_predictions()
            return

        # Single view mode - check model availability
        if not self.mw.model_manager.is_model_available():
            logger.debug("Model not available, returning")
            return

        # Check if we have a bounding box preview to save
        if self._save_bbox_preview():
            return

        # Handle point-based predictions
        self._save_point_prediction()

    def _save_bbox_preview(self) -> bool:
        """Save bounding box preview if available.

        Returns:
            True if bbox was saved, False otherwise
        """
        if not (
            hasattr(self.mw, "ai_bbox_preview_mask")
            and self.mw.ai_bbox_preview_mask is not None
        ):
            return False

        mask = self.mw.ai_bbox_preview_mask

        # Apply fragment threshold filtering if enabled
        filtered_mask = self.apply_fragment_threshold(mask)
        if filtered_mask is not None:
            new_segment = {
                "mask": filtered_mask,
                "type": "AI",
                "vertices": None,
            }
            self.segment_manager.add_segment(new_segment)
            # Record the action for undo
            self.mw.undo_redo_manager.record_action(
                {
                    "type": "add_segment",
                    "segment_index": len(self.segment_manager.segments) - 1,
                }
            )
            # Use incremental update for better performance
            self.mw._update_lists_incremental(
                added_segment_index=len(self.segment_manager.segments) - 1
            )
            self.mw._show_success_notification("AI bounding box segmentation saved!")
        else:
            self.mw._show_warning_notification(
                "All segments filtered out by fragment threshold"
            )

        # Clear bounding box preview state
        self.mw.ai_bbox_preview_mask = None
        self.mw.ai_bbox_preview_rect = None

        # Clear preview
        if hasattr(self.mw, "preview_mask_item") and self.mw.preview_mask_item:
            self.viewer.scene().removeItem(self.mw.preview_mask_item)
            self.mw.preview_mask_item = None

        return True

    def _save_point_prediction(self) -> None:
        """Save point-based AI prediction."""
        has_preview_mask = (
            hasattr(self.mw, "current_preview_mask")
            and self.mw.current_preview_mask is not None
        )
        has_preview_item = (
            hasattr(self.mw, "preview_mask_item") and self.mw.preview_mask_item
        )

        logger.debug(
            f"Point-based save - has_preview_mask: {has_preview_mask}, "
            f"has_preview_item: {has_preview_item}"
        )

        if has_preview_mask:
            mask = self.mw.current_preview_mask
            logger.debug("Using existing current_preview_mask")
        else:
            # No preview mask - need to generate one
            if not has_preview_item:
                logger.debug("No preview item, cannot save")
                return

            result = self.mw.model_manager.sam_model.predict(
                self.mw.positive_points, self.mw.negative_points
            )
            if result is None:
                return
            mask, scores, logits = result

            # Ensure mask is boolean (SAM models can return float masks)
            if mask.dtype != bool:
                mask = mask > 0.5

            # Scale mask back up to display size if needed
            mask = self.mw.coordinate_transformer.scale_mask_to_display(mask)

        # Apply fragment threshold filtering if enabled
        filtered_mask = self.apply_fragment_threshold(mask)
        if filtered_mask is not None:
            new_segment = {
                "mask": filtered_mask,
                "type": "AI",
                "vertices": None,
            }
            self.segment_manager.add_segment(new_segment)
            logger.debug(
                f"Added AI segment. Total segments: {len(self.segment_manager.segments)}"
            )
            # Record the action for undo
            self.mw.undo_redo_manager.record_action(
                {
                    "type": "add_segment",
                    "segment_index": len(self.segment_manager.segments) - 1,
                }
            )
            self.mw.clear_all_points()
            # Use incremental update for better performance
            self.mw._update_lists_incremental(
                added_segment_index=len(self.segment_manager.segments) - 1
            )
            self.mw._show_success_notification("AI segment saved!")
        else:
            self.mw._show_warning_notification(
                "All segments filtered out by fragment threshold"
            )

    # ========== Fragment Threshold ==========

    def apply_fragment_threshold(self, mask: np.ndarray | None) -> np.ndarray | None:
        """Apply fragment threshold filtering to remove small segments.

        Args:
            mask: Binary mask to filter (can be None)

        Returns:
            Filtered mask or None if all segments were filtered out
        """
        if mask is None:
            return None

        if self.mw.fragment_threshold == 0:
            # No filtering when threshold is 0
            return mask

        # Convert mask to uint8 for OpenCV operations
        mask_uint8 = (mask * 255).astype(np.uint8)

        # Find all contours in the mask
        contours, _ = cv2.findContours(
            mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        if not contours:
            return None

        # Calculate areas for all contours
        contour_areas = [cv2.contourArea(contour) for contour in contours]
        max_area = max(contour_areas)

        if max_area == 0:
            return None

        # Calculate minimum area threshold
        min_area_threshold = (self.mw.fragment_threshold / 100.0) * max_area

        # Filter contours based on area threshold
        filtered_contours = [
            contour
            for contour, area in zip(contours, contour_areas, strict=False)
            if area >= min_area_threshold
        ]

        if not filtered_contours:
            return None

        # Create new mask with only filtered contours
        filtered_mask = np.zeros_like(mask_uint8)
        cv2.drawContours(filtered_mask, filtered_contours, -1, 255, -1)

        # Convert back to boolean mask
        return (filtered_mask > 0).astype(bool)

    def toggle_ai_filter(self) -> None:
        """Toggle AI filter between 0 and last set value."""
        new_value = (
            self.mw.last_ai_filter_value if self.mw.fragment_threshold == 0 else 0
        )
        self.control_panel.set_fragment_threshold(new_value)

    # ========== Multi-View Helpers ==========

    def get_segments_for_viewer(self, viewer_index: int) -> list[dict[str, Any]]:
        """Get segments that apply to a specific viewer.

        Args:
            viewer_index: Index of the viewer

        Returns:
            List of segment dictionaries for this viewer
        """
        viewer_segments = []

        for segment in self.segment_manager.segments:
            # Check if segment has view-specific data
            if "views" in segment:
                # Multi-view segment with views structure
                if viewer_index in segment["views"]:
                    # Create a segment for this viewer with the view-specific data
                    viewer_segment = {
                        "type": segment.get("type"),
                        "class_id": segment.get("class_id"),
                    }
                    # Copy view-specific data to the top level
                    viewer_segment.update(segment["views"][viewer_index])
                    # Remove internal metadata before saving
                    viewer_segment.pop("_source_viewer", None)
                    viewer_segments.append(viewer_segment)
            else:
                # Legacy single-view segment - check source viewer
                source_viewer = segment.get("_source_viewer")
                if source_viewer is not None:
                    # Only save if this segment belongs to this viewer
                    if source_viewer == viewer_index:
                        # Create a clean copy without metadata
                        clean_segment = {
                            k: v for k, v in segment.items() if not k.startswith("_")
                        }
                        viewer_segments.append(clean_segment)
                else:
                    # Fallback for segments without source info - include for all viewers
                    clean_segment = {
                        k: v for k, v in segment.items() if not k.startswith("_")
                    }
                    viewer_segments.append(clean_segment)

        return viewer_segments

    def _build_export_context(self, image_path: str, settings: dict) -> ExportContext:
        """Build an ExportContext for the current single-view state."""
        pixmap = self.viewer._pixmap_item.pixmap()
        h, w = pixmap.height(), pixmap.width()
        if h == 0 or w == 0:
            raise ValueError("No image loaded (pixmap is empty)")
        class_order = self.segment_manager.get_unique_class_ids()
        class_labels = [
            self.segment_manager.get_class_alias(cid) for cid in class_order
        ]

        mask_tensor = self.segment_manager.create_final_mask_tensor(
            (h, w),
            class_order,
            settings.get("pixel_priority_enabled", False),
            settings.get("pixel_priority_ascending", True),
        )

        # Apply crop if active
        crop_coords = self.crop_manager.current_crop_coords
        if crop_coords:
            mask_tensor = self.file_manager._apply_crop_to_mask(
                mask_tensor, crop_coords
            )

        return ExportContext(
            image_path=image_path,
            image_size=(h, w),
            class_order=class_order,
            class_labels=class_labels,
            class_aliases=dict(self.segment_manager.class_aliases),
            mask_tensor=mask_tensor,
            crop_coords=crop_coords,
        )

    def _save_viewer_output(
        self, viewer_index: int, image_path: str, saved_files: list[str]
    ) -> bool:
        """Save output for a single viewer in multi-view mode.

        Args:
            viewer_index: Index of the viewer
            image_path: Path to the image
            saved_files: List to append saved filenames to

        Returns:
            True if any files were saved
        """
        viewer_segments = self.get_segments_for_viewer(viewer_index)

        # Get image dimensions from the specific viewer
        if viewer_index < len(self.mw.multi_view_viewers):
            pixmap = self.mw.multi_view_viewers[viewer_index]._pixmap_item.pixmap()
            if not pixmap.isNull():
                h, w = pixmap.height(), pixmap.width()
            else:
                temp_pixmap = QPixmap(image_path)
                h, w = temp_pixmap.height(), temp_pixmap.width()
        else:
            return False

        settings = self.control_panel.get_settings()
        formats = settings.get("export_formats", set())
        if not isinstance(formats, set):
            formats = {ExportFormat(f) for f in formats}

        if viewer_segments:
            # Build a temporary segment manager to compute the mask tensor
            from ...core.segment_manager import SegmentManager

            temp_sm = SegmentManager()
            temp_sm.class_aliases = dict(self.segment_manager.class_aliases)
            for seg in viewer_segments:
                temp_sm.add_segment(seg)

            class_order = temp_sm.get_unique_class_ids()
            class_labels = [temp_sm.get_class_alias(cid) for cid in class_order]

            mask_tensor = temp_sm.create_final_mask_tensor(
                (h, w),
                class_order,
                settings.get("pixel_priority_enabled", False),
                settings.get("pixel_priority_ascending", True),
            )

            ctx = ExportContext(
                image_path=image_path,
                image_size=(h, w),
                class_order=class_order,
                class_labels=class_labels,
                class_aliases=dict(self.segment_manager.class_aliases),
                mask_tensor=mask_tensor,
            )

            written = export_all(formats, ctx)
            saved_files.extend(written)
        else:
            self._delete_multi_view_files(image_path, saved_files)

        return bool(viewer_segments)

    def _delete_associated_files(self, image_path: str) -> None:
        """Delete all known format outputs when no segments exist.

        Args:
            image_path: Path to the image
        """
        deleted_files = delete_all_outputs(image_path)

        if deleted_files:
            if hasattr(self.mw, "right_panel") and hasattr(
                self.mw.right_panel, "file_manager"
            ):
                self.mw.right_panel.file_manager.updateFileStatus(Path(image_path))
            self.mw._show_notification(
                f"Deleted: {', '.join(os.path.basename(f) for f in deleted_files)}"
            )
            self.mw._update_all_lists()
            QApplication.processEvents()
        else:
            self.mw._show_warning_notification("No segments to save.")

    def _delete_multi_view_files(self, image_path: str, saved_files: list[str]) -> None:
        """Delete all known format outputs for a multi-view viewer when no segments exist.

        Args:
            image_path: Path to the image
            saved_files: List tracking which files have been saved
        """
        deleted_files = delete_all_outputs(image_path)

        # Also delete class aliases JSON
        base = os.path.splitext(image_path)[0]
        json_path = base + ".json"
        if os.path.exists(json_path):
            try:
                os.remove(json_path)
                deleted_files.append(json_path)
            except Exception as e:
                logger.error(f"Error deleting {json_path}: {e}")

        if deleted_files:
            self._update_file_status(image_path)
            logger.debug(
                f"Deleted multi-view files: {', '.join(os.path.basename(f) for f in deleted_files)}"
            )

    def _update_file_status(self, image_path: str) -> None:
        """Update file status in the file manager.

        Args:
            image_path: Path to the image
        """
        if hasattr(self.mw, "right_panel") and hasattr(
            self.mw.right_panel, "file_manager"
        ):
            self.mw.right_panel.file_manager.updateFileStatus(Path(image_path))
            # Force immediate GUI update
            QApplication.processEvents()

    # ========== Multi-View Save Entry Point ==========

    def save_multi_view_output(self) -> None:
        """Save output for multi-view mode.

        Saves annotations for each viewer to their respective image files.
        This delegates to the main window's multi-view save method which handles
        the per-viewer segment managers.
        """
        if hasattr(self.mw, "_save_multi_view_annotations"):
            self.mw._save_multi_view_annotations()
            self.mw._show_success_notification("Multi-view annotations saved!")
        else:
            logger.warning("Multi-view save method not available")
            self.mw._show_warning_notification("Multi-view save not available")
