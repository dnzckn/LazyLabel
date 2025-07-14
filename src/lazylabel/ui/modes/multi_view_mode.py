"""Multi view mode handler."""

from PyQt6.QtCore import QPointF, Qt
from PyQt6.QtGui import QBrush, QColor, QPen, QPolygonF
from PyQt6.QtWidgets import QGraphicsEllipseItem, QGraphicsRectItem

from lazylabel.utils.logger import logger

from ...utils import mask_to_pixmap
from ..hoverable_pixelmap_item import HoverablePixmapItem
from ..hoverable_polygon_item import HoverablePolygonItem
from .base_mode import BaseModeHandler


class MultiViewModeHandler(BaseModeHandler):
    """Handler for multi view mode operations."""

    def __init__(self, main_window):
        super().__init__(main_window)
        # Initialize multi-view segment tracking
        if not hasattr(main_window, "multi_view_segment_items"):
            # Initialize with dynamic viewer count
            num_viewers = self._get_num_viewers()
            main_window.multi_view_segment_items = {i: {} for i in range(num_viewers)}

    def _get_num_viewers(self):
        """Get the number of viewers based on current configuration."""
        if hasattr(self.main_window, "multi_view_viewers"):
            return len(self.main_window.multi_view_viewers)
        else:
            # Fallback to settings
            config = self.main_window._get_multi_view_config()
            return config["num_viewers"]

    def _get_other_viewer_indices(self, current_viewer_index):
        """Get indices of all other viewers (excluding current)."""
        num_viewers = self._get_num_viewers()
        return [i for i in range(num_viewers) if i != current_viewer_index]

    def handle_ai_click(self, pos, event, viewer_index=0):
        """Handle AI mode click in multi view."""
        # Check if models need to be initialized (first time use)
        if (
            not hasattr(self.main_window, "multi_view_models")
            or not self.main_window.multi_view_models
            or all(m is None for m in self.main_window.multi_view_models)
        ):
            # Check if already initializing
            if (
                hasattr(self.main_window, "multi_view_init_worker")
                and self.main_window.multi_view_init_worker
                and self.main_window.multi_view_init_worker.isRunning()
            ):
                return  # Don't show duplicate messages

            self.main_window._show_notification(
                "Initializing AI models for multi-view mode...", duration=0
            )  # Persistent message
            self.main_window._initialize_multi_view_models()
            return  # Exit early, models will load in background

        if viewer_index >= len(self.main_window.multi_view_models):
            return

        # Check if the specific viewer's model is updating
        if self.main_window.multi_view_models_updating[viewer_index]:
            # This specific model is still loading - user should wait
            self.main_window._show_notification(
                f"AI model for viewer {viewer_index + 1} is still loading...",
                duration=2000,
            )
            return

        # Check if the specific viewer's model needs the current image loaded
        if self.main_window.multi_view_models_dirty[viewer_index]:
            # This model exists but doesn't have the current image loaded yet

            # Check if any loading session is already in progress to avoid conflicts
            any_loading = any(
                self.main_window.multi_view_models_updating[i]
                for i in range(len(self.main_window.multi_view_models_updating))
            )
            if any_loading:
                self.main_window._show_notification(
                    "AI models are already loading, please wait...", duration=2000
                )
                return

            self.main_window._show_notification(
                f"Loading image into AI model for viewer {viewer_index + 1}...",
                duration=0,
            )
            # Start sequential loading but only show progress for models that need updating
            dirty_count = sum(
                1
                for i in range(len(self.main_window.multi_view_models))
                if self.main_window.multi_view_models_dirty[i]
                and self.main_window.multi_view_images[i]
            )
            if dirty_count > 0:
                # Initialize progress tracking for lazy loading
                self.main_window._multi_view_loading_step = 0
                self.main_window._multi_view_total_steps = dirty_count
                self.main_window._start_sequential_multi_view_sam_loading()
            return  # Exit early, let image load in background

        # Skip AI prediction if model is not ready
        if self.main_window.multi_view_models[viewer_index] is None:
            logger.error(f"AI model not initialized for viewer {viewer_index + 1}")
            self.main_window._show_warning_notification(
                f"AI model not initialized for viewer {viewer_index + 1}"
            )
            return

        # Determine if positive or negative click
        positive = event.button() == Qt.MouseButton.LeftButton

        if positive:
            # Left-click: Set up for potential drag (similar to single-view AI mode)
            if not hasattr(self.main_window, "multi_view_ai_click_starts"):
                num_viewers = self._get_num_viewers()
                self.main_window.multi_view_ai_click_starts = [None] * num_viewers
            if not hasattr(self.main_window, "multi_view_ai_rects"):
                num_viewers = self._get_num_viewers()
                self.main_window.multi_view_ai_rects = [None] * num_viewers

            self.main_window.multi_view_ai_click_starts[viewer_index] = pos
            # We'll determine if it's a click or drag in the move/release handlers
            return

        # Right-click: Add negative point immediately
        model = self.main_window.multi_view_models[viewer_index]
        if model is None:
            logger.error(f"Model not initialized for viewer {viewer_index}")
            return
        viewer = self.main_window.multi_view_viewers[viewer_index]

        # Add visual point to the viewer
        point_color = QColor(0, 255, 0) if positive else QColor(255, 0, 0)
        point_diameter = self.main_window.point_radius * 2
        point_item = QGraphicsEllipseItem(
            pos.x() - self.main_window.point_radius,
            pos.y() - self.main_window.point_radius,
            point_diameter,
            point_diameter,
        )
        point_item.setBrush(QBrush(point_color))
        point_item.setPen(QPen(Qt.PenStyle.NoPen))
        viewer.scene().addItem(point_item)

        # Track point items for clearing
        if not hasattr(self.main_window, "multi_view_point_items"):
            num_viewers = self._get_num_viewers()
            self.main_window.multi_view_point_items = {
                i: [] for i in range(num_viewers)
            }
        self.main_window.multi_view_point_items[viewer_index].append(point_item)

        # Record the action for undo
        self.main_window.action_history.append(
            {
                "type": "add_point",
                "point_type": "positive" if positive else "negative",
                "point_coords": [int(pos.x()), int(pos.y())],
                "point_item": point_item,
                "viewer_mode": "multi",
                "viewer_index": viewer_index,
            }
        )
        # Clear redo history when a new action is performed
        self.main_window.redo_history.clear()

        # Process with SAM model
        try:
            # Convert position to model coordinates
            model_pos = self.main_window._transform_multi_view_coords_to_sam_coords(
                pos, viewer_index
            )

            # Initialize point accumulation for multiview mode (like single view)
            if not hasattr(self.main_window, "multi_view_positive_points"):
                num_viewers = self._get_num_viewers()
                self.main_window.multi_view_positive_points = {
                    i: [] for i in range(num_viewers)
                }
            if not hasattr(self.main_window, "multi_view_negative_points"):
                num_viewers = self._get_num_viewers()
                self.main_window.multi_view_negative_points = {
                    i: [] for i in range(num_viewers)
                }

            # Add current point to accumulated lists
            if positive:
                self.main_window.multi_view_positive_points[viewer_index].append(
                    model_pos
                )
            else:
                self.main_window.multi_view_negative_points[viewer_index].append(
                    model_pos
                )

            # Prepare points for prediction using ALL accumulated points (like single view mode)
            positive_points = self.main_window.multi_view_positive_points[viewer_index]
            negative_points = self.main_window.multi_view_negative_points[viewer_index]

            # Generate mask using the specific model
            result = model.predict(positive_points, negative_points)

            if result is not None and len(result) == 3:
                # Unpack the tuple like single view mode
                mask, scores, logits = result

                # Ensure mask is boolean (SAM models can return float masks)
                if mask.dtype != bool:
                    mask = mask > 0.5

                # Store prediction data for potential saving
                if not hasattr(self.main_window, "multi_view_ai_predictions"):
                    self.main_window.multi_view_ai_predictions = {}

                # Store all accumulated points, not just current point
                all_points = []
                all_labels = []

                # Add all positive points
                for pt in positive_points:
                    all_points.append(pt)
                    all_labels.append(1)

                # Add all negative points
                for pt in negative_points:
                    all_points.append(pt)
                    all_labels.append(0)

                self.main_window.multi_view_ai_predictions[viewer_index] = {
                    "mask": mask.astype(bool),
                    "points": all_points,
                    "labels": all_labels,
                    "model_pos": model_pos,
                    "positive": positive,
                }

                # Show preview mask
                self._display_ai_preview(mask, viewer_index)

                # Generate predictions for all other viewers with same coordinates
                other_viewer_indices = self._get_other_viewer_indices(viewer_index)
                for other_viewer_index in other_viewer_indices:
                    self._generate_paired_ai_preview(
                        viewer_index, other_viewer_index, pos, model_pos, positive
                    )

        except Exception as e:
            logger.error(f"Error processing AI click for viewer {viewer_index}: {e}")

    def handle_polygon_click(self, pos, viewer_index=0):
        """Handle polygon mode click in multi view."""
        points = self.main_window.multi_view_polygon_points[viewer_index]

        # Check if clicking near first point to close polygon
        if points and len(points) > 2:
            first_point = points[0]
            distance_squared = (pos.x() - first_point.x()) ** 2 + (
                pos.y() - first_point.y()
            ) ** 2
            if distance_squared < self.main_window.polygon_join_threshold**2:
                self._finalize_multi_view_polygon(viewer_index)
                return

        # Add point to polygon
        points.append(pos)

        # Add visual point
        viewer = self.main_window.multi_view_viewers[viewer_index]
        point_diameter = self.main_window.point_radius * 2
        point_item = QGraphicsEllipseItem(
            pos.x() - self.main_window.point_radius,
            pos.y() - self.main_window.point_radius,
            point_diameter,
            point_diameter,
        )
        point_item.setBrush(QBrush(QColor(0, 255, 255)))  # Cyan like single view
        point_item.setPen(QPen(Qt.PenStyle.NoPen))
        viewer.scene().addItem(point_item)

        # Store visual item for cleanup
        self.main_window.multi_view_polygon_preview_items[viewer_index].append(
            point_item
        )

    def handle_bbox_start(self, pos, viewer_index=0):
        """Handle bbox mode start in multi view."""
        # Initialize storage if needed
        if not hasattr(self.main_window, "multi_view_bbox_starts"):
            num_viewers = self._get_num_viewers()
            self.main_window.multi_view_bbox_starts = [None] * num_viewers
        if not hasattr(self.main_window, "multi_view_bbox_rects"):
            num_viewers = self._get_num_viewers()
            self.main_window.multi_view_bbox_rects = [None] * num_viewers

        self.main_window.multi_view_bbox_starts[viewer_index] = pos

        # Create rectangle for this viewer
        rect_item = QGraphicsRectItem()
        rect_item.setPen(QPen(QColor(255, 255, 0), 2))  # Yellow
        self.main_window.multi_view_viewers[viewer_index].scene().addItem(rect_item)
        self.main_window.multi_view_bbox_rects[viewer_index] = rect_item

    def handle_bbox_drag(self, pos, viewer_index=0):
        """Handle bbox mode drag in multi view."""
        if (
            hasattr(self.main_window, "multi_view_bbox_starts")
            and hasattr(self.main_window, "multi_view_bbox_rects")
            and self.main_window.multi_view_bbox_starts[viewer_index] is not None
            and self.main_window.multi_view_bbox_rects[viewer_index] is not None
        ):
            from PyQt6.QtCore import QRectF

            start_pos = self.main_window.multi_view_bbox_starts[viewer_index]
            rect = QRectF(start_pos, pos).normalized()
            self.main_window.multi_view_bbox_rects[viewer_index].setRect(rect)

    def handle_bbox_complete(self, pos, viewer_index=0):
        """Handle bbox mode completion in multi view."""
        if not hasattr(self.main_window, "multi_view_bbox_starts") or not hasattr(
            self.main_window, "multi_view_bbox_rects"
        ):
            return

        if (
            self.main_window.multi_view_bbox_starts[viewer_index] is None
            or self.main_window.multi_view_bbox_rects[viewer_index] is None
        ):
            return

        # Complete the bounding box
        start_pos = self.main_window.multi_view_bbox_starts[viewer_index]
        rect_item = self.main_window.multi_view_bbox_rects[viewer_index]

        # Calculate final rectangle
        x = min(start_pos.x(), pos.x())
        y = min(start_pos.y(), pos.y())
        width = abs(pos.x() - start_pos.x())
        height = abs(pos.y() - start_pos.y())

        # Remove temporary rectangle
        self.main_window.multi_view_viewers[viewer_index].scene().removeItem(rect_item)

        # Only create segment if minimum size is met (2x2 pixels)
        if width < 2 or height < 2:
            # Clean up and return without creating segment
            self.main_window.multi_view_bbox_starts[viewer_index] = None
            self.main_window.multi_view_bbox_rects[viewer_index] = None
            return

        # Create view-specific bbox data as polygon
        view_data = {
            "vertices": [
                [x, y],
                [x + width, y],
                [x + width, y + height],
                [x, y + height],
            ],
            "mask": None,
        }

        # Create segment with views structure for all viewers (like polygon mode)
        num_viewers = self._get_num_viewers()

        paired_segment = {"type": "Polygon", "views": {}}

        # Add view data for all viewers with same coordinates
        for viewer_idx in range(num_viewers):
            paired_segment["views"][viewer_idx] = {
                "vertices": view_data["vertices"].copy(),
                "mask": None,
            }

        # Add to segment manager
        self.main_window.segment_manager.add_segment(paired_segment)

        # Record for undo
        self.main_window.action_history.append(
            {"type": "add_segment", "data": paired_segment}
        )

        # Clear redo history when a new action is performed
        self.main_window.redo_history.clear()

        # Clean up
        self.main_window.multi_view_bbox_starts[viewer_index] = None
        self.main_window.multi_view_bbox_rects[viewer_index] = None

    def display_all_segments(self):
        """Display all segments in multi view."""
        # Clear existing segment items from all viewers
        if hasattr(self.main_window, "multi_view_segment_items"):
            for (
                viewer_idx,
                viewer_segments,
            ) in self.main_window.multi_view_segment_items.items():
                for _segment_idx, items in viewer_segments.items():
                    for item in items[
                        :
                    ]:  # Create a copy to avoid modification during iteration
                        try:
                            if item.scene():
                                self.main_window.multi_view_viewers[
                                    viewer_idx
                                ].scene().removeItem(item)
                        except RuntimeError:
                            # Object has been deleted, skip it
                            pass

        # Initialize segment items tracking for multi-view
        num_viewers = self._get_num_viewers()
        self.main_window.multi_view_segment_items = {i: {} for i in range(num_viewers)}

        # Display segments on each viewer
        for i, segment in enumerate(self.segment_manager.segments):
            class_id = segment.get("class_id")
            base_color = self.main_window._get_color_for_class(class_id)

            # Check if segment has view-specific data
            if "views" in segment:
                # New multi-view format
                for viewer_idx in range(len(self.main_window.multi_view_viewers)):
                    if viewer_idx in segment["views"]:
                        self._display_segment_in_viewer(
                            i, segment, viewer_idx, base_color
                        )
            else:
                # Legacy single-view format - display in all viewers
                for viewer_idx in range(len(self.main_window.multi_view_viewers)):
                    self._display_segment_in_viewer(i, segment, viewer_idx, base_color)

    def clear_all_points(self):
        """Clear all temporary points in multi view."""
        # Clear multi-view polygon points
        if hasattr(self.main_window, "multi_view_polygon_points"):
            for i in range(len(self.main_window.multi_view_polygon_points)):
                self._clear_multi_view_polygon(i)

        # Clear AI prediction previews and points
        self._clear_ai_previews()

    def _add_multi_view_segment(self, segment_type, class_id, viewer_index, view_data):
        """Add a segment with view-specific data to the multi-view system."""
        # Delegate to main window's method to ensure consistent undo/redo handling
        self.main_window._add_multi_view_segment(
            segment_type, class_id, viewer_index, view_data
        )

    def _create_paired_ai_segment(
        self, viewer_index, view_data, other_viewer_index, pos, positive
    ):
        """Create paired AI segments for both viewers with the same class ID."""
        try:
            # Check if the other viewer's model is ready
            if (
                other_viewer_index < len(self.main_window.multi_view_models)
                and self.main_window.multi_view_models[other_viewer_index] is not None
                and not self.main_window.multi_view_models_dirty[other_viewer_index]
                and not self.main_window.multi_view_models_updating[other_viewer_index]
            ):
                # Run AI prediction on the other viewer
                other_model = self.main_window.multi_view_models[other_viewer_index]

                # Convert position to model coordinates for the other viewer
                other_model_pos = (
                    self.main_window._transform_multi_view_coords_to_sam_coords(
                        pos, other_viewer_index
                    )
                )

                # Prepare points for prediction
                if positive:
                    positive_points = [other_model_pos]
                    negative_points = []
                else:
                    positive_points = []
                    negative_points = [other_model_pos]

                # Generate mask using the other model
                other_result = other_model.predict(positive_points, negative_points)

                if other_result is not None and len(other_result) == 3:
                    other_mask, other_scores, other_logits = other_result

                    # Ensure mask is boolean
                    if other_mask.dtype != bool:
                        other_mask = other_mask > 0.5

                    # Create view data for the other viewer
                    other_view_data = {
                        "mask": other_mask.astype(bool),
                        "points": [(pos.x(), pos.y())],
                        "labels": [1 if positive else 0],
                    }

                    # Create paired segment with both view data
                    paired_segment = {
                        "type": "AI",
                        "views": {
                            viewer_index: view_data,
                            other_viewer_index: other_view_data,
                        },
                    }

                    # Add to main segment manager (this will assign the same class ID)
                    self.main_window.segment_manager.add_segment(paired_segment)

                    # Record for undo
                    self.main_window.action_history.append(
                        {"type": "add_segment", "data": paired_segment}
                    )

                    # Update UI lists to show the new segment
                    self.main_window._update_all_lists()
                    return

            # If we can't create paired segment, fall back to single segment
            self._add_multi_view_segment("AI", None, viewer_index, view_data)

        except Exception as e:
            logger.error(f"Error creating paired AI segment: {e}")
            # Fall back to single segment
            self._add_multi_view_segment("AI", None, viewer_index, view_data)

    def _display_ai_preview(self, mask, viewer_index):
        """Display AI prediction preview for a specific viewer."""
        if viewer_index >= len(self.main_window.multi_view_viewers):
            return

        viewer = self.main_window.multi_view_viewers[viewer_index]

        # Clear existing preview for this viewer
        if not hasattr(self.main_window, "multi_view_preview_items"):
            self.main_window.multi_view_preview_items = {}
        if (
            viewer_index in self.main_window.multi_view_preview_items
            and self.main_window.multi_view_preview_items[viewer_index].scene()
        ):
            viewer.scene().removeItem(
                self.main_window.multi_view_preview_items[viewer_index]
            )

        # Create preview mask
        pixmap = mask_to_pixmap(mask, (255, 255, 0))  # Yellow preview
        preview_item = viewer.scene().addPixmap(pixmap)
        preview_item.setZValue(50)
        self.main_window.multi_view_preview_items[viewer_index] = preview_item

    def _generate_paired_ai_preview(
        self, source_viewer_index, target_viewer_index, pos, model_pos, positive
    ):
        """Generate AI prediction preview for the paired viewer using same model coordinates."""
        try:
            # Check if the target viewer's model is ready
            if (
                target_viewer_index < len(self.main_window.multi_view_models)
                and self.main_window.multi_view_models[target_viewer_index] is not None
                and not self.main_window.multi_view_models_dirty[target_viewer_index]
                and not self.main_window.multi_view_models_updating[target_viewer_index]
            ):
                # Run AI prediction on the target viewer
                target_model = self.main_window.multi_view_models[target_viewer_index]

                # Use the same model coordinates (no transformation needed)
                target_model_pos = model_pos

                # Prepare points for prediction
                if positive:
                    positive_points = [target_model_pos]
                    negative_points = []
                else:
                    positive_points = []
                    negative_points = [target_model_pos]

                # Generate mask using the target model
                result = target_model.predict(positive_points, negative_points)

                if result is not None and len(result) == 3:
                    mask, scores, logits = result

                    # Ensure mask is boolean
                    if mask.dtype != bool:
                        mask = mask > 0.5

                    # Store prediction data
                    if not hasattr(self.main_window, "multi_view_ai_predictions"):
                        self.main_window.multi_view_ai_predictions = {}

                    self.main_window.multi_view_ai_predictions[target_viewer_index] = {
                        "mask": mask.astype(bool),
                        "points": [(pos.x(), pos.y())],
                        "labels": [1 if positive else 0],
                        "model_pos": target_model_pos,
                        "positive": positive,
                    }

                    # Show preview
                    self._display_ai_preview(mask, target_viewer_index)

        except Exception as e:
            logger.error(f"Error generating paired AI preview: {e}")

    def _generate_paired_ai_bbox_preview(
        self, source_viewer_index, target_viewer_index, box
    ):
        """Generate AI bounding box prediction preview for the paired viewer using same box coordinates."""
        try:
            # Check if the target viewer's model is ready
            if (
                target_viewer_index < len(self.main_window.multi_view_models)
                and self.main_window.multi_view_models[target_viewer_index] is not None
                and not self.main_window.multi_view_models_dirty[target_viewer_index]
                and not self.main_window.multi_view_models_updating[target_viewer_index]
            ):
                # Run AI prediction on the target viewer
                target_model = self.main_window.multi_view_models[target_viewer_index]

                # Use the same bounding box coordinates
                result = target_model.predict_from_box(box)

                if result is not None and len(result) == 3:
                    mask, scores, logits = result

                    # Ensure mask is boolean
                    if mask.dtype != bool:
                        mask = mask > 0.5

                    # Store prediction data
                    if not hasattr(self.main_window, "multi_view_ai_predictions"):
                        self.main_window.multi_view_ai_predictions = {}

                    self.main_window.multi_view_ai_predictions[target_viewer_index] = {
                        "mask": mask.astype(bool),
                        "box": box,
                        "points": [],  # Empty for box predictions
                        "labels": [],  # Empty for box predictions
                    }

                    # Show preview
                    self._display_ai_preview(mask, target_viewer_index)

        except Exception as e:
            logger.error(f"Error generating paired AI bbox preview: {e}")

    def _clear_ai_previews(self):
        """Clear AI prediction previews and points from all viewers."""
        # Clear preview masks
        if hasattr(self.main_window, "multi_view_preview_items"):
            for (
                viewer_index,
                preview_item,
            ) in self.main_window.multi_view_preview_items.items():
                if preview_item and preview_item.scene():
                    self.main_window.multi_view_viewers[
                        viewer_index
                    ].scene().removeItem(preview_item)
            self.main_window.multi_view_preview_items.clear()

        # Clear prediction data
        if hasattr(self.main_window, "multi_view_ai_predictions"):
            self.main_window.multi_view_ai_predictions.clear()

        # Clear tracked point items
        if hasattr(self.main_window, "multi_view_point_items"):
            for (
                viewer_index,
                point_items,
            ) in self.main_window.multi_view_point_items.items():
                for point_item in point_items:
                    if point_item.scene():
                        self.main_window.multi_view_viewers[
                            viewer_index
                        ].scene().removeItem(point_item)
                point_items.clear()

        # Clear accumulated point lists (like single view mode)
        if hasattr(self.main_window, "multi_view_positive_points"):
            for viewer_points in self.main_window.multi_view_positive_points.values():
                viewer_points.clear()
        if hasattr(self.main_window, "multi_view_negative_points"):
            for viewer_points in self.main_window.multi_view_negative_points.values():
                viewer_points.clear()

    def save_ai_predictions(self):
        """Save AI predictions as actual segments."""
        if not hasattr(self.main_window, "multi_view_ai_predictions"):
            return

        predictions = self.main_window.multi_view_ai_predictions
        if len(predictions) == 0:
            return

        # Create paired segments with views structure for multi-view mode
        num_viewers = self._get_num_viewers()
        if len(predictions) >= 2:
            # Multiple viewers have predictions - create paired segment with views structure
            # Get the current active class or determine next class ID
            active_class = self.main_window.segment_manager.get_active_class()
            if active_class is None:
                # Determine next class ID
                existing_classes = (
                    self.main_window.segment_manager.get_unique_class_ids()
                )
                next_class_id = max(existing_classes) + 1 if existing_classes else 1
            else:
                next_class_id = active_class

            # Create paired segment with both viewer data
            paired_segment = {"type": "AI", "class_id": next_class_id, "views": {}}

            # Add view data for each viewer
            for viewer_index in range(num_viewers):
                if viewer_index in predictions:
                    view_data = {"mask": predictions[viewer_index]["mask"]}
                    # Add points/labels if they exist (point-based prediction)
                    if "points" in predictions[viewer_index]:
                        view_data["points"] = predictions[viewer_index]["points"]
                        view_data["labels"] = predictions[viewer_index]["labels"]
                    # Add box if it exists (box-based prediction)
                    if "box" in predictions[viewer_index]:
                        view_data["box"] = predictions[viewer_index]["box"]

                    paired_segment["views"][viewer_index] = view_data

            # Add to main segment manager
            self.main_window.segment_manager.add_segment(paired_segment)

            # Record for undo
            self.main_window.action_history.append(
                {"type": "add_segment", "data": paired_segment}
            )

            self.main_window._update_all_lists()

        else:
            # Only one viewer has prediction - create single segment with views structure
            for viewer_index, prediction in predictions.items():
                view_data = {"mask": prediction["mask"]}
                # Add points/labels if they exist (point-based prediction)
                if "points" in prediction:
                    view_data["points"] = prediction["points"]
                    view_data["labels"] = prediction["labels"]
                # Add box if it exists (box-based prediction)
                if "box" in prediction:
                    view_data["box"] = prediction["box"]

                segment_data = {"type": "AI", "views": {viewer_index: view_data}}
                self.main_window.segment_manager.add_segment(segment_data)

                # Record for undo
                self.main_window.action_history.append(
                    {"type": "add_segment", "data": segment_data}
                )

            self.main_window._update_all_lists()

        # Clear previews after saving
        self._clear_ai_previews()

    def _finalize_multi_view_polygon(self, viewer_index):
        """Finalize polygon drawing for a specific viewer."""
        points = self.main_window.multi_view_polygon_points[viewer_index]
        if len(points) < 3:
            return

        # Create view-specific polygon data
        view_data = {
            "vertices": [[p.x(), p.y()] for p in points],
            "mask": None,
        }

        # Mirror the polygon to all other viewers automatically
        num_viewers = self._get_num_viewers()

        # Create segment with views structure for all viewers
        paired_segment = {"type": "Polygon", "views": {}}

        # Add the current viewer's data
        paired_segment["views"][viewer_index] = view_data

        # Mirror to all other viewers with same coordinates (they should align between linked images)
        for other_viewer_index in range(num_viewers):
            if other_viewer_index != viewer_index:
                mirrored_view_data = {
                    "vertices": view_data[
                        "vertices"
                    ].copy(),  # Use same coordinates for mirrored polygon
                    "mask": None,
                }
                paired_segment["views"][other_viewer_index] = mirrored_view_data

        # Add to segment manager
        self.main_window.segment_manager.add_segment(paired_segment)

        # Record for undo
        self.main_window.action_history.append(
            {"type": "add_segment", "data": paired_segment}
        )

        # Clear redo history when a new action is performed
        self.main_window.redo_history.clear()

        # Update UI
        self.main_window._update_all_lists()
        viewer_count_text = "all viewers" if num_viewers > 2 else "both viewers"
        self.main_window._show_notification(
            f"Polygon created and mirrored to {viewer_count_text}."
        )

        # Clear polygon state for this viewer
        self._clear_multi_view_polygon(viewer_index)

    def _clear_multi_view_polygon(self, viewer_index):
        """Clear polygon state for a specific viewer."""
        # Clear points
        if hasattr(
            self.main_window, "multi_view_polygon_points"
        ) and viewer_index < len(self.main_window.multi_view_polygon_points):
            self.main_window.multi_view_polygon_points[viewer_index].clear()

        # Remove all visual items
        if (
            hasattr(self.main_window, "multi_view_viewers")
            and viewer_index < len(self.main_window.multi_view_viewers)
            and hasattr(self.main_window, "multi_view_polygon_preview_items")
            and viewer_index < len(self.main_window.multi_view_polygon_preview_items)
        ):
            viewer = self.main_window.multi_view_viewers[viewer_index]
            for item in self.main_window.multi_view_polygon_preview_items[viewer_index]:
                if item.scene():
                    viewer.scene().removeItem(item)
            self.main_window.multi_view_polygon_preview_items[viewer_index].clear()

    def _display_segment_in_viewer(
        self, segment_index, segment, viewer_index, base_color
    ):
        """Display a specific segment in a specific viewer."""
        if viewer_index >= len(self.main_window.multi_view_viewers):
            return

        viewer = self.main_window.multi_view_viewers[viewer_index]

        # Initialize segment items for this viewer if needed
        if segment_index not in self.main_window.multi_view_segment_items[viewer_index]:
            self.main_window.multi_view_segment_items[viewer_index][segment_index] = []

        # Get segment data (either from views or direct)
        if "views" in segment and viewer_index in segment["views"]:
            segment_data = segment["views"][viewer_index]
            segment_type = segment["type"]
        else:
            segment_data = segment
            segment_type = segment["type"]

        # Display based on type
        if segment_type == "Polygon" and segment_data.get("vertices"):
            # Display polygon
            qpoints = [QPointF(p[0], p[1]) for p in segment_data["vertices"]]
            poly_item = HoverablePolygonItem(QPolygonF(qpoints))

            default_brush = QBrush(
                QColor(base_color.red(), base_color.green(), base_color.blue(), 70)
            )
            hover_brush = QBrush(
                QColor(base_color.red(), base_color.green(), base_color.blue(), 170)
            )
            poly_item.set_brushes(default_brush, hover_brush)
            poly_item.set_segment_info(segment_index, self.main_window)
            poly_item.setPen(QPen(Qt.GlobalColor.transparent))

            logger.debug(
                f"Created HoverablePolygonItem for segment {segment_index} in viewer {viewer_index}"
            )

            viewer.scene().addItem(poly_item)
            self.main_window.multi_view_segment_items[viewer_index][
                segment_index
            ].append(poly_item)

        elif segment_type == "AI" and segment_data.get("mask") is not None:
            # Display AI mask
            default_pixmap = mask_to_pixmap(
                segment_data["mask"], base_color.getRgb()[:3], alpha=70
            )
            hover_pixmap = mask_to_pixmap(
                segment_data["mask"], base_color.getRgb()[:3], alpha=170
            )
            pixmap_item = HoverablePixmapItem()
            pixmap_item.set_pixmaps(default_pixmap, hover_pixmap)
            pixmap_item.set_segment_info(segment_index, self.main_window)

            logger.debug(
                f"Created HoverablePixmapItem for segment {segment_index} in viewer {viewer_index}"
            )

            viewer.scene().addItem(pixmap_item)
            pixmap_item.setZValue(segment_index + 1)
            self.main_window.multi_view_segment_items[viewer_index][
                segment_index
            ].append(pixmap_item)

    def handle_ai_drag(self, pos, viewer_index=0):
        """Handle AI mode drag in multi view."""
        if (
            not hasattr(self.main_window, "multi_view_ai_click_starts")
            or not hasattr(self.main_window, "multi_view_ai_rects")
            or self.main_window.multi_view_ai_click_starts[viewer_index] is None
        ):
            return

        start_pos = self.main_window.multi_view_ai_click_starts[viewer_index]

        # Check if we've moved enough to consider this a drag
        drag_distance = (
            (pos.x() - start_pos.x()) ** 2 + (pos.y() - start_pos.y()) ** 2
        ) ** 0.5

        if drag_distance > 5:  # Minimum drag distance
            viewer = self.main_window.multi_view_viewers[viewer_index]

            # Create rubber band if not exists
            if self.main_window.multi_view_ai_rects[viewer_index] is None:
                from PyQt6.QtCore import Qt
                from PyQt6.QtGui import QPen
                from PyQt6.QtWidgets import QGraphicsRectItem

                rect_item = QGraphicsRectItem()
                rect_item.setPen(QPen(Qt.GlobalColor.cyan, 2, Qt.PenStyle.DashLine))
                viewer.scene().addItem(rect_item)
                self.main_window.multi_view_ai_rects[viewer_index] = rect_item

            # Update rubber band
            from PyQt6.QtCore import QRectF

            rect = QRectF(start_pos, pos).normalized()
            self.main_window.multi_view_ai_rects[viewer_index].setRect(rect)

    def handle_ai_complete(self, pos, viewer_index=0):
        """Handle AI mode completion in multi view."""
        if (
            not hasattr(self.main_window, "multi_view_ai_click_starts")
            or self.main_window.multi_view_ai_click_starts[viewer_index] is None
        ):
            return

        start_pos = self.main_window.multi_view_ai_click_starts[viewer_index]

        # Calculate drag distance
        drag_distance = (
            (pos.x() - start_pos.x()) ** 2 + (pos.y() - start_pos.y()) ** 2
        ) ** 0.5

        if (
            hasattr(self.main_window, "multi_view_ai_rects")
            and self.main_window.multi_view_ai_rects[viewer_index] is not None
            and drag_distance > 5
        ):
            # This was a drag - use AI bounding box prediction
            rect_item = self.main_window.multi_view_ai_rects[viewer_index]
            rect = rect_item.rect()

            # Remove rubber band
            viewer = self.main_window.multi_view_viewers[viewer_index]
            viewer.scene().removeItem(rect_item)
            self.main_window.multi_view_ai_rects[viewer_index] = None
            self.main_window.multi_view_ai_click_starts[viewer_index] = None

            if rect.width() > 10 and rect.height() > 10:  # Minimum box size
                self._handle_multi_view_ai_bounding_box(rect, viewer_index)
        else:
            # This was a click - add positive point
            self.main_window.multi_view_ai_click_starts[viewer_index] = None
            if (
                hasattr(self.main_window, "multi_view_ai_rects")
                and self.main_window.multi_view_ai_rects[viewer_index] is not None
            ):
                viewer = self.main_window.multi_view_viewers[viewer_index]
                viewer.scene().removeItem(
                    self.main_window.multi_view_ai_rects[viewer_index]
                )
                self.main_window.multi_view_ai_rects[viewer_index] = None

            # Add positive point
            self._handle_multi_view_ai_click_point(pos, viewer_index, positive=True)

    def _handle_multi_view_ai_bounding_box(self, rect, viewer_index):
        """Handle AI bounding box prediction for a specific viewer in multi-view mode."""
        # Similar to single-view _handle_ai_bounding_box but for specific viewer
        if viewer_index >= len(self.main_window.multi_view_models):
            return

        model = self.main_window.multi_view_models[viewer_index]
        if model is None:
            logger.error(f"Model not initialized for viewer {viewer_index}")
            return

        try:
            # Convert QRectF to SAM box format [x1, y1, x2, y2]
            # from PyQt6.QtCore import QPointF
            # top_left = QPointF(rect.left(), rect.top())
            # bottom_right = QPointF(rect.right(), rect.bottom())

            # For multi-view, we need to transform coordinates to model space
            # This would need the coordinate transformation logic
            box = [rect.left(), rect.top(), rect.right(), rect.bottom()]

            # Generate mask using bounding box
            result = model.predict_from_box(box)

            if result is not None and len(result) == 3:
                mask, scores, logits = result

                # Ensure mask is boolean
                if mask.dtype != bool:
                    mask = mask > 0.5

                # Store prediction data for potential saving
                if not hasattr(self.main_window, "multi_view_ai_predictions"):
                    self.main_window.multi_view_ai_predictions = {}

                self.main_window.multi_view_ai_predictions[viewer_index] = {
                    "mask": mask.astype(bool),
                    "box": box,
                    "points": [],  # Empty for box predictions
                    "labels": [],  # Empty for box predictions
                }

                # Show preview mask
                self._display_ai_preview(mask, viewer_index)

                # Generate predictions for all other viewers with same bounding box
                other_viewer_indices = self._get_other_viewer_indices(viewer_index)
                for other_viewer_index in other_viewer_indices:
                    self._generate_paired_ai_bbox_preview(
                        viewer_index, other_viewer_index, box
                    )

        except Exception as e:
            logger.error(
                f"Error processing AI bounding box for viewer {viewer_index}: {e}"
            )

    def _handle_multi_view_ai_click_point(self, pos, viewer_index, positive=True):
        """Handle AI point click for a specific viewer (extracted from handle_ai_click)."""
        model = self.main_window.multi_view_models[viewer_index]
        if model is None:
            logger.error(f"Model not initialized for viewer {viewer_index}")
            return
        viewer = self.main_window.multi_view_viewers[viewer_index]

        # Add visual point to the viewer
        point_color = QColor(0, 255, 0) if positive else QColor(255, 0, 0)
        point_diameter = self.main_window.point_radius * 2
        point_item = QGraphicsEllipseItem(
            pos.x() - self.main_window.point_radius,
            pos.y() - self.main_window.point_radius,
            point_diameter,
            point_diameter,
        )
        point_item.setBrush(QBrush(point_color))
        point_item.setPen(QPen(Qt.PenStyle.NoPen))
        viewer.scene().addItem(point_item)

        # Track point items for clearing
        if not hasattr(self.main_window, "multi_view_point_items"):
            # Initialize with dynamic viewer count
            num_viewers = self._get_num_viewers()
            self.main_window.multi_view_point_items = {
                i: [] for i in range(num_viewers)
            }
        self.main_window.multi_view_point_items[viewer_index].append(point_item)

        # Record the action for undo
        self.main_window.action_history.append(
            {
                "type": "add_point",
                "point_type": "positive" if positive else "negative",
                "point_coords": [int(pos.x()), int(pos.y())],
                "point_item": point_item,
                "viewer_mode": "multi",
                "viewer_index": viewer_index,
            }
        )
        # Clear redo history when a new action is performed
        self.main_window.redo_history.clear()

        # Process with SAM model
        try:
            # Convert position to model coordinates
            model_pos = self.main_window._transform_multi_view_coords_to_sam_coords(
                pos, viewer_index
            )

            # Initialize point accumulation for multiview mode (like single view)
            if not hasattr(self.main_window, "multi_view_positive_points"):
                num_viewers = self._get_num_viewers()
                self.main_window.multi_view_positive_points = {
                    i: [] for i in range(num_viewers)
                }
            if not hasattr(self.main_window, "multi_view_negative_points"):
                num_viewers = self._get_num_viewers()
                self.main_window.multi_view_negative_points = {
                    i: [] for i in range(num_viewers)
                }

            # Add current point to accumulated lists
            if positive:
                self.main_window.multi_view_positive_points[viewer_index].append(
                    model_pos
                )
            else:
                self.main_window.multi_view_negative_points[viewer_index].append(
                    model_pos
                )

            # Prepare points for prediction using ALL accumulated points (like single view mode)
            positive_points = self.main_window.multi_view_positive_points[viewer_index]
            negative_points = self.main_window.multi_view_negative_points[viewer_index]

            # Generate mask using the specific model
            result = model.predict(positive_points, negative_points)

            if result is not None and len(result) == 3:
                # Unpack the tuple like single view mode
                mask, scores, logits = result

                # Ensure mask is boolean (SAM models can return float masks)
                if mask.dtype != bool:
                    mask = mask > 0.5

                # Store prediction data for potential saving
                if not hasattr(self.main_window, "multi_view_ai_predictions"):
                    self.main_window.multi_view_ai_predictions = {}

                # Store all accumulated points, not just current point
                all_points = []
                all_labels = []

                # Add all positive points
                for pt in positive_points:
                    all_points.append(pt)
                    all_labels.append(1)

                # Add all negative points
                for pt in negative_points:
                    all_points.append(pt)
                    all_labels.append(0)

                self.main_window.multi_view_ai_predictions[viewer_index] = {
                    "mask": mask.astype(bool),
                    "points": all_points,
                    "labels": all_labels,
                    "model_pos": model_pos,
                    "positive": positive,
                }

                # Show preview mask
                self._display_ai_preview(mask, viewer_index)

                # Generate predictions for all other viewers with same coordinates
                other_viewer_indices = self._get_other_viewer_indices(viewer_index)
                for other_viewer_index in other_viewer_indices:
                    self._generate_paired_ai_preview(
                        viewer_index, other_viewer_index, pos, model_pos, positive
                    )

        except Exception as e:
            logger.error(f"Error processing AI click for viewer {viewer_index}: {e}")
