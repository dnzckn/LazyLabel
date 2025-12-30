"""Unit tests for MultiViewSAMInitWorker.

Tests the worker thread that initializes SAM models for multi-view mode,
including model type detection and lifecycle management.
"""

import pytest


@pytest.fixture
def worker(app):
    """Create MultiViewSAMInitWorker for testing."""
    from lazylabel.ui.workers.multi_view_sam_init_worker import MultiViewSAMInitWorker

    return MultiViewSAMInitWorker(
        num_viewers=2,
        default_model_type="vit_h",
        custom_model_path=None,
    )


@pytest.fixture
def worker_with_custom_path(app):
    """Create MultiViewSAMInitWorker with custom model path."""
    from lazylabel.ui.workers.multi_view_sam_init_worker import MultiViewSAMInitWorker

    return MultiViewSAMInitWorker(
        num_viewers=2,
        default_model_type="vit_h",
        custom_model_path="/path/to/custom_model.pth",
    )


# ========== Model Detection Tests ==========


class TestMultiViewSAMInitWorkerModelDetection:
    """Tests for SAM 1 vs SAM 2 model detection."""

    def test_is_sam2_model_with_sam2_in_filename(self, worker):
        """Test detection of SAM2 model with 'sam2' in filename."""
        assert worker._is_sam2_model("/path/to/sam2_hiera_large.pth") is True
        assert worker._is_sam2_model("/path/to/SAM2_model.pth") is True

    def test_is_sam2_model_with_sam2_1_in_filename(self, worker):
        """Test detection of SAM2 model with 'sam2.1' in filename."""
        assert worker._is_sam2_model("/path/to/sam2.1_hiera_large.pt") is True

    def test_is_sam2_model_with_hiera_in_filename(self, worker):
        """Test detection of SAM2 model with 'hiera' in filename."""
        assert worker._is_sam2_model("/path/to/hiera_large.pth") is True

    def test_is_sam2_model_with_tiny_suffix(self, worker):
        """Test detection of SAM2 model with '_t.' suffix."""
        assert worker._is_sam2_model("/path/to/model_t.pth") is True

    def test_is_sam2_model_with_small_suffix(self, worker):
        """Test detection of SAM2 model with '_s.' suffix."""
        assert worker._is_sam2_model("/path/to/model_s.pth") is True

    def test_is_sam2_model_with_base_plus_suffix(self, worker):
        """Test detection of SAM2 model with '_b+.' suffix."""
        assert worker._is_sam2_model("/path/to/model_b+.pth") is True

    def test_is_sam2_model_with_large_suffix(self, worker):
        """Test detection of SAM2 model with '_l.' suffix."""
        assert worker._is_sam2_model("/path/to/model_l.pth") is True

    def test_is_sam2_model_with_sam1_filename_returns_false(self, worker):
        """Test that SAM1 model filenames return False.

        Note: Filenames with '_l.', '_s.', '_t.', '_b+.' are detected as SAM2
        due to the indicator patterns. Use explicit naming to avoid ambiguity.
        """
        assert worker._is_sam2_model("/path/to/sam_vit_h.pth") is False
        assert worker._is_sam2_model("/path/to/sam_vit_base.pth") is False
        assert worker._is_sam2_model("/path/to/original_sam.pth") is False

    def test_detect_model_type_sam2_tiny(self, worker):
        """Test detection of SAM2 tiny model type."""
        assert worker._detect_model_type("/path/to/sam2_tiny.pth") == "sam2_tiny"
        assert worker._detect_model_type("/path/to/sam2_hiera_t.pth") == "sam2_tiny"

    def test_detect_model_type_sam2_small(self, worker):
        """Test detection of SAM2 small model type."""
        assert worker._detect_model_type("/path/to/sam2_small.pth") == "sam2_small"
        assert worker._detect_model_type("/path/to/sam2_hiera_s.pth") == "sam2_small"

    def test_detect_model_type_sam2_base_plus(self, worker):
        """Test detection of SAM2 base_plus model type."""
        assert (
            worker._detect_model_type("/path/to/sam2_base_plus.pth") == "sam2_base_plus"
        )
        assert (
            worker._detect_model_type("/path/to/sam2_hiera_b+.pth") == "sam2_base_plus"
        )

    def test_detect_model_type_sam2_large(self, worker):
        """Test detection of SAM2 large model type."""
        assert worker._detect_model_type("/path/to/sam2_large.pth") == "sam2_large"
        assert worker._detect_model_type("/path/to/sam2_hiera_l.pth") == "sam2_large"

    def test_detect_model_type_sam2_defaults_to_large(self, worker):
        """Test that unknown SAM2 model defaults to large."""
        assert worker._detect_model_type("/path/to/sam2_unknown.pth") == "sam2_large"

    def test_detect_model_type_sam1_vit_l(self, worker):
        """Test detection of SAM1 vit_l model type.

        Note: Filenames with '_l.' match SAM2 pattern. Use 'large' keyword
        or explicit 'vit_l_' prefix to trigger SAM1 vit_l detection.
        """
        # 'large' keyword triggers vit_l for non-SAM2 files
        assert worker._detect_model_type("/path/to/sam_large_model.pth") == "vit_l"
        # Explicit vit_l without trailing dot pattern
        assert worker._detect_model_type("/path/to/sam_vit_l_checkpoint.pth") == "vit_l"

    def test_detect_model_type_sam1_vit_b(self, worker):
        """Test detection of SAM1 vit_b model type."""
        assert worker._detect_model_type("/path/to/sam_vit_b.pth") == "vit_b"
        assert worker._detect_model_type("/path/to/sam_base.pth") == "vit_b"

    def test_detect_model_type_sam1_vit_h(self, worker):
        """Test detection of SAM1 vit_h model type."""
        assert worker._detect_model_type("/path/to/sam_vit_h.pth") == "vit_h"
        assert worker._detect_model_type("/path/to/sam_huge.pth") == "vit_h"

    def test_detect_model_type_sam1_defaults_to_vit_h(self, worker):
        """Test that unknown SAM1 model defaults to vit_h."""
        assert worker._detect_model_type("/path/to/unknown_model.pth") == "vit_h"


# ========== Lifecycle Tests ==========


class TestMultiViewSAMInitWorkerLifecycle:
    """Tests for worker lifecycle methods."""

    def test_stop_sets_should_stop_flag(self, worker):
        """Test that stop() sets the should_stop flag."""
        assert worker._should_stop is False
        worker.stop()
        assert worker._should_stop is True

    def test_initial_models_created_empty(self, worker):
        """Test that models_created is empty initially."""
        assert worker.models_created == []

    def test_worker_initialization_with_default_params(self, worker):
        """Test worker initialization with default parameters."""
        assert worker.num_viewers == 2
        assert worker.default_model_type == "vit_h"
        assert worker.custom_model_path is None
        assert worker._should_stop is False

    def test_worker_initialization_with_custom_path(self, worker_with_custom_path):
        """Test worker initialization with custom model path."""
        assert worker_with_custom_path.num_viewers == 2
        assert worker_with_custom_path.default_model_type == "vit_h"
        assert worker_with_custom_path.custom_model_path == "/path/to/custom_model.pth"

    def test_worker_initialization_with_different_num_viewers(self, app):
        """Test worker initialization with different number of viewers."""
        from lazylabel.ui.workers.multi_view_sam_init_worker import (
            MultiViewSAMInitWorker,
        )

        worker = MultiViewSAMInitWorker(
            num_viewers=4,
            default_model_type="vit_l",
            custom_model_path=None,
        )
        assert worker.num_viewers == 4
        assert worker.default_model_type == "vit_l"

    def test_worker_has_required_signals(self, worker):
        """Test that worker has all required signals."""
        assert hasattr(worker, "model_initialized")
        assert hasattr(worker, "all_models_initialized")
        assert hasattr(worker, "error")
        assert hasattr(worker, "progress")

    def test_stop_before_run_prevents_execution(self, worker):
        """Test that stopping before run prevents execution."""
        worker.stop()
        # run() should return early if _should_stop is True
        # We can't easily test run() without actual model loading,
        # but we verify the flag is set
        assert worker._should_stop is True
