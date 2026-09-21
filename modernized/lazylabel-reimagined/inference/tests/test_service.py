import pytest




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


class TestDecodingAMask:
    """The inverse of `encode_mask`, needed once a mask travels TOWARDS the service.

    That happens for exactly one reason: a propagation reference is the user's own annotation,
    seeding the run. Everything else in this service produces masks and never receives them.
    """

    def wire(self, **overrides):
        import numpy as np

        from lazylabel_inference.service import encode_mask

        array = np.zeros((6, 8), dtype=np.uint8)
        array[2:5, 3:7] = 1
        return {**encode_mask(array), **overrides}

    def test_it_round_trips_exactly(self):
        import numpy as np

        from lazylabel_inference.service import decode_mask, encode_mask

        for shape, region in [((6, 8), (slice(2, 5), slice(3, 7))), ((1, 1), (slice(0, 1), slice(0, 1)))]:
            array = np.zeros(shape, dtype=np.uint8)
            array[region] = 1

            assert np.array_equal(decode_mask(encode_mask(array)), array)

    def test_the_far_edges_of_the_box_are_EXCLUSIVE(self):
        import numpy as np

        from lazylabel_inference.service import decode_mask

        # `encode_mask` computes them as `width - argmax(...)`. Reading them as inclusive loses the
        # last row and column of every reference mask -- an error that survives a visual check and
        # shows up as a mask shrinking by a pixel on each round trip.
        decoded = decode_mask(self.wire())

        assert decoded[4, 6] == 1
        assert decoded[5, 7] == 0
        assert int(decoded.sum()) == 12

    def test_an_empty_mask_decodes_to_an_empty_ARRAY_not_an_error(self):
        import numpy as np

        from lazylabel_inference.service import decode_mask

        # `encode_mask` produces this for an all-zero array, so it is a legal encoding. Whether an
        # empty mask may be USED is a different question, and `seed_mask` refuses it by name.
        decoded = decode_mask({"height": 4, "width": 4, "box": None, "data": ""})

        assert decoded.shape == (4, 4)
        assert not decoded.any()

    def test_a_payload_that_disagrees_with_its_box_is_refused(self):
        from lazylabel_inference.prompts import InvalidPromptError
        from lazylabel_inference.service import decode_mask

        # The only check that catches a box and a payload describing different regions. Without it
        # numpy either throws somewhere unhelpful or silently reshapes.
        with pytest.raises(InvalidPromptError, match="needs 12"):
            decode_mask(self.wire(data="AAAA"))

    def test_a_box_outside_the_image_is_refused(self):
        from lazylabel_inference.prompts import InvalidPromptError
        from lazylabel_inference.service import decode_mask

        with pytest.raises(InvalidPromptError, match="does not fit"):
            decode_mask(self.wire(box=[0, 0, 99, 99]))

    def test_data_that_is_not_base64_is_refused(self):
        from lazylabel_inference.prompts import InvalidPromptError
        from lazylabel_inference.service import decode_mask

        with pytest.raises(InvalidPromptError, match="base64"):
            decode_mask(self.wire(data="not base64!!"))

    def test_a_missing_size_is_refused(self):
        from lazylabel_inference.prompts import InvalidPromptError
        from lazylabel_inference.service import decode_mask

        with pytest.raises(InvalidPromptError, match="height"):
            decode_mask({"box": None, "data": ""})

    def test_something_that_is_not_an_object_at_all_is_refused(self):
        from lazylabel_inference.prompts import InvalidPromptError
        from lazylabel_inference.service import decode_mask

        with pytest.raises(InvalidPromptError, match="must be an object"):
            decode_mask("a mask")
