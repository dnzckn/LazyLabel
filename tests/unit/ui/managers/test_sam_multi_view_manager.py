"""Unit tests for SAMMultiViewManager.

Tests the SAM operations manager for multi-view mode, including
state accessors, model initialization, image loading, predictions,
and state management.

Note: MultiViewSAMInitWorker is mocked via conftest.py to avoid PyQt6 cleanup
issues on Linux. The worker is tested separately in test_multi_view_sam_init_worker.py.
"""

from unittest.mock import MagicMock, Mock, patch

import numpy as np
import pytest


@pytest.fixture
def mock_main_window():
    """Create a mock MainWindow for SAMMultiViewManager tests."""
    mw = MagicMock()
    mw.settings = MagicMock()
    mw.settings.default_model_type = "vit_h"
    mw.pending_custom_model_path = None
    mw.model_explicitly_unloaded = False
    mw.multi_view_image_paths = ["/path/to/image1.png", "/path/to/image2.png"]
    mw._show_notification = MagicMock()
    mw._show_success_notification = MagicMock()
    mw._show_error_notification = MagicMock()
    return mw


@pytest.fixture
def sam_manager(app, mock_main_window):
    """Create SAMMultiViewManager with mock main window."""
    from lazylabel.ui.managers.sam_multi_view_manager import SAMMultiViewManager

    return SAMMultiViewManager(mock_main_window)


@pytest.fixture
def mock_sam_model():
    """Create a mock SAM model with required attributes."""
    model = MagicMock()
    model.is_loaded = True
    model.predict.return_value = (
        np.zeros((100, 100), dtype=bool),
        0.9,
        None,
    )
    model.predict_from_box.return_value = (
        np.zeros((100, 100), dtype=bool),
        0.9,
        None,
    )
    model.set_image_from_path.return_value = True
    return model


# ========== State Accessors Tests ==========


class TestSAMMultiViewManagerStateAccessors:
    """Tests for state accessor methods."""

    def test_get_sam_is_dirty_initial_state_is_true(self, sam_manager):
        """Test that initial dirty state is True for both viewers."""
        assert sam_manager.get_sam_is_dirty(0) is True
        assert sam_manager.get_sam_is_dirty(1) is True

    def test_get_sam_is_dirty_invalid_index_returns_true(self, sam_manager):
        """Test that invalid index returns True (conservative default)."""
        assert sam_manager.get_sam_is_dirty(2) is True
        assert sam_manager.get_sam_is_dirty(-1) is True

    def test_set_sam_is_dirty_viewer_zero(self, sam_manager):
        """Test setting dirty state for viewer 0."""
        sam_manager.set_sam_is_dirty(0, False)
        assert sam_manager.get_sam_is_dirty(0) is False
        assert sam_manager.get_sam_is_dirty(1) is True

    def test_set_sam_is_dirty_viewer_one(self, sam_manager):
        """Test setting dirty state for viewer 1."""
        sam_manager.set_sam_is_dirty(1, False)
        assert sam_manager.get_sam_is_dirty(0) is True
        assert sam_manager.get_sam_is_dirty(1) is False

    def test_set_sam_is_dirty_invalid_index_ignored(self, sam_manager):
        """Test that invalid index is ignored when setting dirty state."""
        sam_manager.set_sam_is_dirty(2, False)
        # Should not affect valid indices
        assert sam_manager.get_sam_is_dirty(0) is True
        assert sam_manager.get_sam_is_dirty(1) is True

    def test_is_model_ready_when_no_model_returns_false(self, sam_manager):
        """Test is_model_ready returns False when no model loaded."""
        assert sam_manager.is_model_ready(0) is False
        assert sam_manager.is_model_ready(1) is False

    def test_is_model_ready_when_model_not_loaded_returns_false(
        self, sam_manager, mock_sam_model
    ):
        """Test is_model_ready returns False when model not loaded."""
        mock_sam_model.is_loaded = False
        sam_manager._sam_models[0] = mock_sam_model
        assert sam_manager.is_model_ready(0) is False

    def test_is_model_ready_when_model_loaded_returns_true(
        self, sam_manager, mock_sam_model
    ):
        """Test is_model_ready returns True when model is loaded."""
        sam_manager._sam_models[0] = mock_sam_model
        assert sam_manager.is_model_ready(0) is True

    def test_is_model_ready_invalid_index_returns_false(self, sam_manager):
        """Test is_model_ready returns False for invalid index."""
        assert sam_manager.is_model_ready(2) is False
        assert sam_manager.is_model_ready(-1) is False

    def test_are_all_models_ready_when_none_ready(self, sam_manager):
        """Test are_all_models_ready returns False when no models ready."""
        assert sam_manager.are_all_models_ready() is False

    def test_are_all_models_ready_when_one_ready(self, sam_manager, mock_sam_model):
        """Test are_all_models_ready returns False when only one ready."""
        sam_manager._sam_models[0] = mock_sam_model
        assert sam_manager.are_all_models_ready() is False

    def test_are_all_models_ready_when_both_ready(self, sam_manager, mock_sam_model):
        """Test are_all_models_ready returns True when both ready."""
        sam_manager._sam_models[0] = mock_sam_model
        sam_manager._sam_models[1] = mock_sam_model
        assert sam_manager.are_all_models_ready() is True

    def test_is_initializing_initial_state(self, sam_manager):
        """Test is_initializing returns False initially."""
        assert sam_manager.is_initializing() is False

    def test_get_sam_scale_factor_always_returns_one(self, sam_manager):
        """Test get_sam_scale_factor always returns 1.0 for multi-view."""
        assert sam_manager.get_sam_scale_factor(0) == 1.0
        assert sam_manager.get_sam_scale_factor(1) == 1.0
        assert sam_manager.get_sam_scale_factor(999) == 1.0


# ========== Initialization Tests ==========


class TestSAMMultiViewManagerInitialization:
    """Tests for model initialization workflow."""

    def test_start_initialization_returns_true_first_time(self, sam_manager):
        """Test start_initialization returns True on first call."""
        with (
            patch.object(sam_manager, "_cleanup_init_worker"),
            patch(
                "lazylabel.ui.managers.sam_multi_view_manager.MultiViewSAMInitWorker"
            ) as mock_worker_class,
        ):
            mock_worker = MagicMock()
            mock_worker_class.return_value = mock_worker

            result = sam_manager.start_initialization()

            assert result is True
            assert sam_manager._models_initializing is True
            mock_worker.start.assert_called_once()

    def test_start_initialization_returns_false_when_already_initializing(
        self, sam_manager
    ):
        """Test start_initialization returns False when already initializing."""
        sam_manager._models_initializing = True
        result = sam_manager.start_initialization()
        assert result is False

    def test_start_initialization_returns_false_after_failure(self, sam_manager):
        """Test start_initialization returns False after previous failure."""
        sam_manager._init_failed = True
        result = sam_manager.start_initialization()
        assert result is False

    def test_on_model_initialized_stores_model(self, sam_manager, mock_sam_model):
        """Test _on_model_initialized stores the model."""
        sam_manager._on_model_initialized(0, mock_sam_model)
        assert sam_manager._sam_models[0] is mock_sam_model

    def test_on_model_initialized_marks_dirty(self, sam_manager, mock_sam_model):
        """Test _on_model_initialized marks viewer as dirty."""
        sam_manager._sam_is_dirty[0] = False
        sam_manager._on_model_initialized(0, mock_sam_model)
        assert sam_manager._sam_is_dirty[0] is True

    def test_on_all_models_initialized_clears_initializing_flag(self, sam_manager):
        """Test _on_all_models_initialized clears the initializing flag."""
        sam_manager._models_initializing = True
        sam_manager._on_all_models_initialized([Mock(), Mock()])
        assert sam_manager._models_initializing is False

    def test_on_all_models_initialized_shows_success_notification(
        self, sam_manager, mock_main_window
    ):
        """Test _on_all_models_initialized shows success notification."""
        sam_manager._on_all_models_initialized([Mock(), Mock()])
        mock_main_window._show_success_notification.assert_called_once()

    def test_on_all_models_initialized_clears_pending_path(
        self, sam_manager, mock_main_window
    ):
        """Test _on_all_models_initialized clears pending custom model path."""
        mock_main_window.pending_custom_model_path = "/path/to/model"
        sam_manager._on_all_models_initialized([Mock(), Mock()])
        assert mock_main_window.pending_custom_model_path is None

    def test_on_init_error_sets_failed_flag(self, sam_manager):
        """Test _on_init_error sets the failed flag."""
        sam_manager._on_init_error("Test error")
        assert sam_manager._init_failed is True

    def test_on_init_error_clears_initializing_flag(self, sam_manager):
        """Test _on_init_error clears the initializing flag."""
        sam_manager._models_initializing = True
        sam_manager._on_init_error("Test error")
        assert sam_manager._models_initializing is False

    def test_on_init_error_shows_error_notification(
        self, sam_manager, mock_main_window
    ):
        """Test _on_init_error shows error notification."""
        sam_manager._on_init_error("Test error message")
        mock_main_window._show_error_notification.assert_called_once()
        call_args = mock_main_window._show_error_notification.call_args[0][0]
        assert "Test error message" in call_args

    def test_reset_init_failed_allows_retry(self, sam_manager):
        """Test reset_init_failed allows retry after failure."""
        sam_manager._init_failed = True
        sam_manager.reset_init_failed()
        assert sam_manager._init_failed is False

    def test_on_init_progress_shows_notification(self, sam_manager, mock_main_window):
        """Test _on_init_progress shows notification."""
        sam_manager._on_init_progress("Loading model...")
        mock_main_window._show_notification.assert_called_with(
            "Loading model...", duration=0
        )


# ========== Image Loading Tests ==========


class TestSAMMultiViewManagerImageLoading:
    """Tests for image loading into SAM models."""

    def test_ensure_viewer_image_loaded_invalid_index_returns_false(self, sam_manager):
        """Test ensure_viewer_image_loaded returns False for invalid index."""
        assert sam_manager.ensure_viewer_image_loaded(2) is False
        assert sam_manager.ensure_viewer_image_loaded(-1) is False

    def test_ensure_viewer_image_loaded_no_model_returns_false(self, sam_manager):
        """Test ensure_viewer_image_loaded returns False when no model."""
        # Model is None by default, but prevent starting initialization
        sam_manager._init_failed = True  # Prevent start_initialization from running
        result = sam_manager.ensure_viewer_image_loaded(0)
        assert result is False

    def test_ensure_viewer_image_loaded_starts_initialization_if_not_started(
        self, sam_manager
    ):
        """Test ensure_viewer_image_loaded starts initialization if needed."""
        with patch.object(sam_manager, "start_initialization") as mock_start:
            sam_manager.ensure_viewer_image_loaded(0)
            mock_start.assert_called_once()

    def test_ensure_viewer_image_loaded_not_dirty_returns_true(
        self, sam_manager, mock_sam_model
    ):
        """Test ensure_viewer_image_loaded returns True when not dirty."""
        sam_manager._sam_models[0] = mock_sam_model
        sam_manager._sam_is_dirty[0] = False
        assert sam_manager.ensure_viewer_image_loaded(0) is True

    def test_ensure_viewer_image_loaded_no_image_path_returns_false(
        self, sam_manager, mock_sam_model, mock_main_window
    ):
        """Test ensure_viewer_image_loaded returns False when no image path."""
        sam_manager._sam_models[0] = mock_sam_model
        mock_main_window.multi_view_image_paths = [None, None]
        assert sam_manager.ensure_viewer_image_loaded(0) is False

    def test_ensure_viewer_image_loaded_success(
        self, sam_manager, mock_sam_model, mock_main_window
    ):
        """Test ensure_viewer_image_loaded succeeds with valid setup."""
        sam_manager._sam_models[0] = mock_sam_model
        mock_main_window.multi_view_image_paths = ["/path/to/image.png", None]

        result = sam_manager.ensure_viewer_image_loaded(0)

        assert result is True
        assert sam_manager._sam_is_dirty[0] is False
        mock_sam_model.set_image_from_path.assert_called_once_with("/path/to/image.png")

    def test_ensure_viewer_image_loaded_same_hash_skips_reload(
        self, sam_manager, mock_sam_model, mock_main_window
    ):
        """Test ensure_viewer_image_loaded skips reload for same image."""
        import hashlib

        image_path = "/path/to/image.png"
        image_hash = hashlib.md5(image_path.encode()).hexdigest()

        sam_manager._sam_models[0] = mock_sam_model
        sam_manager._current_sam_hash[0] = image_hash
        mock_main_window.multi_view_image_paths = [image_path, None]

        result = sam_manager.ensure_viewer_image_loaded(0)

        assert result is True
        assert sam_manager._sam_is_dirty[0] is False
        # set_image_from_path should NOT be called
        mock_sam_model.set_image_from_path.assert_not_called()

    def test_ensure_viewer_image_loaded_failure_returns_false(
        self, sam_manager, mock_sam_model, mock_main_window
    ):
        """Test ensure_viewer_image_loaded returns False on load failure."""
        sam_manager._sam_models[0] = mock_sam_model
        mock_sam_model.set_image_from_path.return_value = False
        mock_main_window.multi_view_image_paths = ["/path/to/image.png", None]

        result = sam_manager.ensure_viewer_image_loaded(0)

        assert result is False

    def test_ensure_viewer_image_loaded_exception_returns_false(
        self, sam_manager, mock_sam_model, mock_main_window
    ):
        """Test ensure_viewer_image_loaded returns False on exception."""
        sam_manager._sam_models[0] = mock_sam_model
        mock_sam_model.set_image_from_path.side_effect = Exception("Test error")
        mock_main_window.multi_view_image_paths = ["/path/to/image.png", None]

        result = sam_manager.ensure_viewer_image_loaded(0)

        assert result is False


# ========== Prediction Tests ==========


class TestSAMMultiViewManagerPrediction:
    """Tests for SAM prediction methods."""

    def test_predict_invalid_viewer_returns_none(self, sam_manager):
        """Test predict returns None for invalid viewer index."""
        result = sam_manager.predict(2, [[10, 20]], [])
        assert result is None

    def test_predict_no_positive_points_returns_none(
        self, sam_manager, mock_sam_model, mock_main_window
    ):
        """Test predict returns None when no positive points."""
        sam_manager._sam_models[0] = mock_sam_model
        sam_manager._sam_is_dirty[0] = False

        result = sam_manager.predict(0, [], [[10, 20]])

        assert result is None

    def test_predict_image_not_loaded_returns_none(self, sam_manager):
        """Test predict returns None when image not loaded."""
        # No model loaded, prevent starting initialization
        sam_manager._init_failed = True
        result = sam_manager.predict(0, [[10, 20]], [])
        assert result is None

    def test_predict_success_returns_result(
        self, sam_manager, mock_sam_model, mock_main_window
    ):
        """Test predict returns result on success."""
        sam_manager._sam_models[0] = mock_sam_model
        sam_manager._sam_is_dirty[0] = False

        result = sam_manager.predict(0, [[10, 20]], [[30, 40]])

        assert result is not None
        mock_sam_model.predict.assert_called_once_with([[10, 20]], [[30, 40]])

    def test_predict_exception_returns_none(
        self, sam_manager, mock_sam_model, mock_main_window
    ):
        """Test predict returns None on exception."""
        sam_manager._sam_models[0] = mock_sam_model
        sam_manager._sam_is_dirty[0] = False
        mock_sam_model.predict.side_effect = Exception("Test error")

        result = sam_manager.predict(0, [[10, 20]], [])

        assert result is None

    def test_predict_from_box_invalid_viewer_returns_none(self, sam_manager):
        """Test predict_from_box returns None for invalid viewer index."""
        result = sam_manager.predict_from_box(2, (10, 20, 100, 200))
        assert result is None

    def test_predict_from_box_success(
        self, sam_manager, mock_sam_model, mock_main_window
    ):
        """Test predict_from_box returns result on success."""
        sam_manager._sam_models[0] = mock_sam_model
        sam_manager._sam_is_dirty[0] = False

        result = sam_manager.predict_from_box(0, (10, 20, 100, 200))

        assert result is not None
        mock_sam_model.predict_from_box.assert_called_once_with((10, 20, 100, 200))

    def test_predict_from_box_exception_returns_none(
        self, sam_manager, mock_sam_model, mock_main_window
    ):
        """Test predict_from_box returns None on exception."""
        sam_manager._sam_models[0] = mock_sam_model
        sam_manager._sam_is_dirty[0] = False
        mock_sam_model.predict_from_box.side_effect = Exception("Test error")

        result = sam_manager.predict_from_box(0, (10, 20, 100, 200))

        assert result is None

    def test_predict_from_box_image_not_loaded_returns_none(self, sam_manager):
        """Test predict_from_box returns None when image not loaded."""
        # No model loaded, prevent starting initialization
        sam_manager._init_failed = True
        result = sam_manager.predict_from_box(0, (10, 20, 100, 200))
        assert result is None


# ========== State Management Tests ==========


class TestSAMMultiViewManagerStateManagement:
    """Tests for state management methods."""

    def test_mark_all_dirty(self, sam_manager):
        """Test mark_all_dirty marks both viewers as dirty."""
        sam_manager._sam_is_dirty = [False, False]
        sam_manager.mark_all_dirty()
        assert sam_manager._sam_is_dirty == [True, True]

    def test_mark_viewer_dirty_valid_index(self, sam_manager):
        """Test mark_viewer_dirty marks specific viewer as dirty."""
        sam_manager._sam_is_dirty = [False, False]
        sam_manager.mark_viewer_dirty(0)
        assert sam_manager._sam_is_dirty == [True, False]

        sam_manager._sam_is_dirty = [False, False]
        sam_manager.mark_viewer_dirty(1)
        assert sam_manager._sam_is_dirty == [False, True]

    def test_mark_viewer_dirty_invalid_index_ignored(self, sam_manager):
        """Test mark_viewer_dirty ignores invalid index."""
        sam_manager._sam_is_dirty = [False, False]
        sam_manager.mark_viewer_dirty(2)
        assert sam_manager._sam_is_dirty == [False, False]

    def test_cleanup_clears_models(self, sam_manager, mock_sam_model):
        """Test cleanup clears SAM models."""
        # Set models individually to avoid reference issues
        sam_manager._sam_models[0] = mock_sam_model
        sam_manager._sam_models[1] = MagicMock()
        sam_manager._sam_models[1].is_loaded = True

        with patch("torch.cuda.is_available", return_value=False):
            sam_manager.cleanup()

        assert sam_manager._sam_models == [None, None]

    def test_cleanup_resets_state(self, sam_manager):
        """Test cleanup resets all state."""
        sam_manager._sam_is_dirty = [False, False]
        sam_manager._current_sam_hash = ["hash1", "hash2"]
        sam_manager._models_initializing = True
        sam_manager._init_failed = True

        with patch("torch.cuda.is_available", return_value=False):
            sam_manager.cleanup()

        assert sam_manager._sam_is_dirty == [True, True]
        assert sam_manager._current_sam_hash == [None, None]
        assert sam_manager._models_initializing is False
        assert sam_manager._init_failed is False

    def test_cleanup_calls_cuda_empty_cache_if_available(self, sam_manager):
        """Test cleanup calls cuda.empty_cache if CUDA available."""
        with (
            patch("torch.cuda.is_available", return_value=True),
            patch("torch.cuda.empty_cache") as mock_empty_cache,
        ):
            sam_manager.cleanup()
            mock_empty_cache.assert_called_once()

    def test_cleanup_stops_init_worker(self, sam_manager):
        """Test cleanup stops any running init worker."""
        mock_worker = MagicMock()
        sam_manager._init_worker = mock_worker

        with (
            patch("torch.cuda.is_available", return_value=False),
            patch(
                "lazylabel.ui.managers.sam_multi_view_manager.stop_worker"
            ) as mock_stop,
        ):
            sam_manager.cleanup()
            mock_stop.assert_called_once_with(mock_worker)
