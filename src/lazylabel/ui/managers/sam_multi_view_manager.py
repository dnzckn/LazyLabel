"""SAM Multi-View Manager for managing SAM operations in multi-view mode.

This manager handles:
- Dual SAM model instances (one per viewer)
- Per-viewer image loading and state tracking
- Parallel predictions without image switching
- Async model initialization with proper SAM 1/2 detection
"""

from __future__ import annotations

import hashlib
from typing import TYPE_CHECKING

from ...utils.logger import logger
from ..utils.worker_utils import stop_worker
from ..workers import MultiViewSAMInitWorker

if TYPE_CHECKING:
    from ..main_window import MainWindow


class SAMMultiViewManager:
    """Manages SAM operations for multi-view mode.

    Key design: Uses TWO separate SAM model instances, one per viewer.
    Each model keeps its image loaded, enabling fast predictions without
    the overhead of switching images between viewers.
    """

    def __init__(self, main_window: MainWindow):
        """Initialize the SAM multi-view manager.

        Args:
            main_window: Parent MainWindow instance
        """
        self.mw = main_window

        # Per-viewer SAM models (loaded by worker)
        self._sam_models: list = [None, None]

        # Per-viewer state tracking
        self._sam_is_dirty: list[bool] = [True, True]
        self._current_sam_hash: list[str | None] = [None, None]

        # Initialization state
        self._init_worker: MultiViewSAMInitWorker | None = None
        self._models_initializing = False
        self._init_failed = False  # Prevent retry loops

    # ========== State Accessors ==========

    def get_sam_is_dirty(self, viewer_idx: int) -> bool:
        """Get SAM dirty state for a viewer."""
        return self._sam_is_dirty[viewer_idx] if viewer_idx in (0, 1) else True

    def set_sam_is_dirty(self, viewer_idx: int, value: bool) -> None:
        """Set SAM dirty state for a viewer."""
        if viewer_idx in (0, 1):
            self._sam_is_dirty[viewer_idx] = value

    def is_model_ready(self, viewer_idx: int = 0) -> bool:
        """Check if SAM model is ready for a viewer."""
        if viewer_idx not in (0, 1):
            return False
        model = self._sam_models[viewer_idx]
        return model is not None and getattr(model, "is_loaded", False)

    def are_all_models_ready(self) -> bool:
        """Check if all SAM models are ready."""
        return self.is_model_ready(0) and self.is_model_ready(1)

    def is_initializing(self) -> bool:
        """Check if models are currently being initialized."""
        return self._models_initializing

    def get_sam_scale_factor(self, viewer_idx: int) -> float:
        """Get the SAM scale factor for a viewer.

        For multi-view, we always use scale_factor=1.0 (no downscaling).

        Args:
            viewer_idx: Index of the viewer (0 or 1)

        Returns:
            Scale factor (always 1.0 for multi-view)
        """
        return 1.0

    # ========== Model Initialization ==========

    def start_initialization(self) -> bool:
        """Start async initialization of SAM models for both viewers.

        Returns:
            True if initialization started, False if already initializing or failed
        """
        # Don't retry if initialization already failed
        if self._init_failed:
            logger.warning("Multi-view SAM init already failed, not retrying")
            return False

        if self._models_initializing:
            logger.debug("Multi-view SAM models already initializing")
            return False

        # Clean up any existing worker
        self._cleanup_init_worker()

        # Mark as initializing
        self._models_initializing = True

        # Get model settings
        model_type = self.mw.settings.default_model_type
        custom_path = getattr(self.mw, "pending_custom_model_path", None)

        logger.info(
            f"Starting multi-view SAM initialization "
            f"(type={model_type}, custom={custom_path is not None})"
        )

        # Create and start worker
        self._init_worker = MultiViewSAMInitWorker(
            num_viewers=2,
            default_model_type=model_type,
            custom_model_path=custom_path,
        )

        # Connect signals
        self._init_worker.progress.connect(self._on_init_progress)
        self._init_worker.model_initialized.connect(self._on_model_initialized)
        self._init_worker.all_models_initialized.connect(
            self._on_all_models_initialized
        )
        self._init_worker.error.connect(self._on_init_error)

        self._init_worker.start()
        return True

    def _on_init_progress(self, message: str) -> None:
        """Handle initialization progress message.

        Uses duration=0 to keep message visible until next update or completion.
        """
        self.mw._show_notification(message, duration=0)

    def _on_model_initialized(self, viewer_idx: int, model) -> None:
        """Handle single model initialization completion."""
        logger.info(f"Multi-view SAM model {viewer_idx} initialized")
        self._sam_models[viewer_idx] = model
        self._sam_is_dirty[viewer_idx] = True  # Need to load image

    def _on_all_models_initialized(self, models: list) -> None:
        """Handle all models initialization completion."""
        self._models_initializing = False

        # Clear pending custom model path since it's now loaded
        self.mw.pending_custom_model_path = None

        # Show success message
        self.mw._show_success_notification(
            "AI models ready for prompting", duration=3000
        )

        logger.info(f"All {len(models)} multi-view SAM models initialized")

        # Clean up worker
        self._cleanup_init_worker()

    def _on_init_error(self, error_msg: str) -> None:
        """Handle initialization error."""
        self._models_initializing = False
        self._init_failed = True  # Prevent retry loops

        logger.error(f"Multi-view SAM initialization error: {error_msg}")

        # Show error to user with error styling (longer duration)
        self.mw._show_error_notification(f"AI model error: {error_msg}")

        # Clean up worker
        self._cleanup_init_worker()

    def _cleanup_init_worker(self) -> None:
        """Clean up the initialization worker."""
        if self._init_worker:
            stop_worker(self._init_worker)
            self._init_worker.deleteLater()
            self._init_worker = None

    # ========== Image Update ==========

    def ensure_viewer_image_loaded(self, viewer_idx: int) -> bool:
        """Ensure SAM has the specified viewer's image loaded.

        Args:
            viewer_idx: Index of the viewer (0 or 1)

        Returns:
            True if image is ready, False if loading is needed or failed
        """
        if viewer_idx not in (0, 1):
            return False

        # Check if model is ready
        if not self.is_model_ready(viewer_idx):
            # Start initialization if not already done
            if not self._models_initializing and not self._init_failed:
                self.start_initialization()
            return False

        # Check if image is already loaded and not dirty
        if not self._sam_is_dirty[viewer_idx]:
            return True

        # Get the image path for this viewer
        if not hasattr(self.mw, "multi_view_image_paths"):
            return False

        image_path = self.mw.multi_view_image_paths[viewer_idx]
        if not image_path:
            logger.debug(f"No image path for viewer {viewer_idx}")
            return False

        # Compute hash to check if update needed
        image_hash = hashlib.md5(image_path.encode()).hexdigest()

        if image_hash == self._current_sam_hash[viewer_idx]:
            # Same image already loaded
            self._sam_is_dirty[viewer_idx] = False
            return True

        # Load image into this viewer's SAM model
        try:
            model = self._sam_models[viewer_idx]
            success = model.set_image_from_path(image_path)
            if success:
                self._sam_is_dirty[viewer_idx] = False
                self._current_sam_hash[viewer_idx] = image_hash
                logger.debug(f"Loaded image for viewer {viewer_idx} into its SAM model")
                return True
            else:
                logger.error(f"Failed to load image for viewer {viewer_idx}")
                return False
        except Exception as e:
            logger.error(f"Error loading image for viewer {viewer_idx}: {e}")
            return False

    # ========== Prediction ==========

    def predict(
        self,
        viewer_idx: int,
        positive_points: list,
        negative_points: list,
    ) -> tuple | None:
        """Run SAM prediction for a specific viewer.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
            positive_points: List of [x, y] positive points
            negative_points: List of [x, y] negative points

        Returns:
            Tuple of (mask, score, logits) or None if prediction fails
        """
        if viewer_idx not in (0, 1):
            return None

        # Ensure image is loaded for this viewer
        if not self.ensure_viewer_image_loaded(viewer_idx):
            logger.warning(f"Could not load image for viewer {viewer_idx}")
            return None

        if not positive_points:
            return None

        try:
            model = self._sam_models[viewer_idx]
            result = model.predict(positive_points, negative_points)
            return result
        except Exception as e:
            logger.error(f"SAM prediction failed for viewer {viewer_idx}: {e}")
            return None

    def predict_from_box(
        self,
        viewer_idx: int,
        box: tuple,
    ) -> tuple | None:
        """Run SAM box prediction for a specific viewer.

        Args:
            viewer_idx: Index of the viewer (0 or 1)
            box: Bounding box tuple (x1, y1, x2, y2)

        Returns:
            Tuple of (mask, score, logits) or None if prediction fails
        """
        if viewer_idx not in (0, 1):
            logger.warning(f"Invalid viewer_idx: {viewer_idx}")
            return None

        logger.debug(f"predict_from_box: viewer={viewer_idx}, box={box}")

        # Ensure image is loaded for this viewer
        if not self.ensure_viewer_image_loaded(viewer_idx):
            logger.warning(f"Could not load image for viewer {viewer_idx}")
            return None

        logger.debug(
            f"Image loaded for viewer {viewer_idx}, calling SAM predict_from_box"
        )

        try:
            model = self._sam_models[viewer_idx]
            result = model.predict_from_box(box)
            if result:
                logger.debug(f"SAM returned result for viewer {viewer_idx}")
            else:
                logger.warning(f"SAM returned None for viewer {viewer_idx}")
            return result
        except Exception as e:
            logger.error(f"SAM box prediction failed for viewer {viewer_idx}: {e}")
            return None

    # ========== State Management ==========

    def mark_all_dirty(self) -> None:
        """Mark both viewers as needing SAM image update."""
        self._sam_is_dirty = [True, True]

    def mark_viewer_dirty(self, viewer_idx: int) -> None:
        """Mark a specific viewer as needing SAM image update."""
        if viewer_idx in (0, 1):
            self._sam_is_dirty[viewer_idx] = True

    def reset_init_failed(self) -> None:
        """Reset the init failed flag to allow retry.

        Call this when the user explicitly requests a new model load.
        """
        self._init_failed = False

    def cleanup(self) -> None:
        """Clean up resources and unload models."""
        import torch

        # Stop any running worker
        self._cleanup_init_worker()

        # Clean up models
        for i in range(2):
            if self._sam_models[i] is not None:
                self._sam_models[i] = None

        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        # Reset state
        self._sam_is_dirty = [True, True]
        self._current_sam_hash = [None, None]
        self._models_initializing = False
        self._init_failed = False

        logger.debug("SAM multi-view manager cleaned up")
