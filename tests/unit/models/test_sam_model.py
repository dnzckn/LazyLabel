from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from lazylabel.models.sam_model import SamModel


@pytest.fixture
def sam_model():
    """Fixture for SamModel."""
    with (
        patch("lazylabel.models.sam_model.sam_model_registry") as mock_registry,
        patch("lazylabel.models.sam_model.SamPredictor") as mock_predictor,
        patch("lazylabel.models.sam_model.download_model") as mock_download,
        patch("os.path.exists") as mock_exists,
    ):
        # Mock the model registry to return a dummy model
        mock_registry.__getitem__.return_value = MagicMock()
        # Mock the predictor
        mock_predictor.return_value = MagicMock()
        # Mock download and path exists
        mock_download.return_value = None
        mock_exists.return_value = True

        model = SamModel(model_type="vit_h")
        yield model


def test_sam_model_initialization(sam_model):
    """Test SamModel initialization."""
    assert sam_model.is_loaded
    assert sam_model.predictor is not None


@patch("cv2.imread")
@patch("cv2.cvtColor")
def test_set_image_from_path(mock_cvt_color, mock_read, sam_model):
    """Test setting an image from path."""
    mock_read.return_value = np.zeros((100, 100, 3), dtype=np.uint8)
    mock_cvt_color.return_value = np.zeros((100, 100, 3), dtype=np.uint8)
    sam_model.set_image_from_path("dummy_path.png")
    sam_model.predictor.set_image.assert_called_once()


def test_set_image_from_array(sam_model):
    """Test setting an image from a numpy array."""
    dummy_array = np.zeros((200, 200, 3), dtype=np.uint8)
    sam_model.set_image_from_array(dummy_array)
    sam_model.predictor.set_image.assert_called_once_with(dummy_array)


def test_predict(sam_model):
    """Test point-based prediction."""
    positive_points = [[50, 50]]
    negative_points = [[10, 10]]
    sam_model.predictor.predict.return_value = (
        np.zeros((1, 100, 100)),
        np.zeros(1),
        np.zeros(1),
    )
    result = sam_model.predict(positive_points, negative_points)
    assert result is not None
    mask, scores, logits = result
    assert mask.shape == (100, 100)
