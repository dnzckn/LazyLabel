

def test_posted_pixels_are_used_instead_of_the_file(tmp_path, monkeypatch):
    """RULE-089: with Operate On View on, the model must see what the USER sees.

    The API renders the display adjustments and posts the bytes. Reading the file here would undo
    them -- and would do it silently, which is the failure worth a test: the handle comes back, the
    mask comes back, and it is a mask of the wrong picture.
    """
    import base64
    import io

    import numpy as np
    from PIL import Image

    from lazylabel_inference.service import InferenceService

    # A PNG that exists only in the request. Nothing of this colour is on disk.
    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), (10, 200, 30)).save(buffer, format="PNG")
    posted = base64.b64encode(buffer.getvalue()).decode()

    service = InferenceService.__new__(InferenceService)
    decoded = service._read_image(tmp_path / "does-not-exist.png", posted)

    assert decoded.shape == (4, 4, 3)
    # RGB, not BGR: the loader converts, and getting it wrong shows up as a red-blue swap.
    assert tuple(int(v) for v in decoded[0][0]) == (10, 200, 30)


def test_unreadable_posted_pixels_are_refused_rather_than_guessed(tmp_path):
    """A base64 string that is not an image must fail loudly.

    Falling back to the file would hand the model the unadjusted picture under a handle that claims
    to be adjusted -- the silent wrong answer this whole path exists to avoid.
    """
    import base64

    import pytest

    from lazylabel_inference.service import InferenceService, ImageUnreadableError

    service = InferenceService.__new__(InferenceService)
    with pytest.raises(ImageUnreadableError):
        service._read_image(tmp_path / "x.png", base64.b64encode(b"not a png").decode())
