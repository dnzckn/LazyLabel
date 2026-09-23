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
        # numpy either throws somewhere unhelpful or silently reshapes. The box is 4x3, twelve
        # pixels: two bytes packed as bits, twelve at a byte each -- and three is neither.
        with pytest.raises(InvalidPromptError, match="needs 2"):
            decode_mask(self.wire(data="AAAA"))
        with pytest.raises(InvalidPromptError, match="needs 12"):
            decode_mask({**self.wire(data="AAAA"), "packing": None})

    def test_it_packs_one_bit_per_pixel_first_pixel_highest(self):
        # np.packbits' order, which is the order @lazylabel/contracts reads; the TypeScript suite
        # checks the same bytes from its side (contracts/test/pythonFixture.test.ts).
        import base64

        import numpy as np

        from lazylabel_inference.service import encode_mask

        row = np.array([[1, 0, 1, 1, 0, 0, 0, 1, 1]], dtype=np.uint8)
        wire = encode_mask(row)

        assert wire["packing"] == "bits"
        assert base64.b64decode(wire["data"]) == bytes([0b10110001, 0b10000000])

    def test_a_payload_at_a_byte_per_pixel_still_decodes(self):
        # What every mask looked like before bit packing, and what an older client still sends.
        import base64

        import numpy as np

        from lazylabel_inference.service import decode_mask

        wire = {"height": 2, "width": 3, "box": [0, 0, 3, 2], "data": base64.b64encode(bytes([1, 0, 1, 0, 1, 0])).decode()}

        assert decode_mask(wire).tolist() == [[1, 0, 1], [0, 1, 0]]
        assert decode_mask(wire).dtype == np.uint8

    def test_a_packing_it_does_not_know_is_refused(self):
        from lazylabel_inference.prompts import InvalidPromptError
        from lazylabel_inference.service import decode_mask

        with pytest.raises(InvalidPromptError, match="no decoder knows"):
            decode_mask(self.wire(packing="rle"))

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


class TestOnlyListedFormatsReachADecoder:
    """SEC-02: the decoder is chosen by CONTENT, so the check has to be on content too.

    `cv2.imread` picks a codec from a file's first bytes, and OpenCV's wheels bundle codecs pip-audit
    does not track -- OpenEXR 2.3.0 and OpenJPEG among them. The API refuses formats outside its
    allow-list, but this service reads the dataset DIRECTLY, so a file named `x.png` holding EXR
    bytes went straight past the API's check to whatever decoder OpenCV chose.
    """

    def service(self, root):
        from lazylabel_inference.service import InferenceService

        return InferenceService(models=[], model_dir=root, dataset_root=root)

    @pytest.mark.parametrize(
        ("name", "head"),
        [
            ("openexr", b"v/1\x01" + b"\x00" * 60),
            ("jpeg2000", b"\x00\x00\x00\x0cjP  \r\n\x87\n" + b"\x00" * 60),
            ("pfm", b"PF\n4 4\n-1.0\n" + b"\x00" * 60),
            ("sun raster", b"\x59\xa6\x6a\x95" + b"\x00" * 60),
        ],
    )
    def test_an_unlisted_format_is_refused_whatever_the_file_is_CALLED(
        self, tmp_path, name, head
    ) -> None:
        from lazylabel_inference.service import ImageUnreadableError

        # Named .png deliberately: the extension is exactly what an attacker controls.
        (tmp_path / "x.png").write_bytes(head)

        with pytest.raises(ImageUnreadableError, match="not an image type LazyLabel opens"):
            self.service(tmp_path).read_image("x.png")

    def test_a_real_png_still_decodes(self, tmp_path) -> None:
        import io

        from PIL import Image

        buffer = io.BytesIO()
        Image.new("RGB", (4, 3), (10, 200, 30)).save(buffer, format="PNG")
        (tmp_path / "ok.png").write_bytes(buffer.getvalue())

        decoded = self.service(tmp_path).read_image("ok.png")

        assert decoded.shape == (3, 4, 3)
        assert tuple(decoded[0, 0]) == (10, 200, 30)

    def test_a_listed_format_that_will_not_decode_says_which_format_it_claimed(
        self, tmp_path
    ) -> None:
        from lazylabel_inference.service import ImageUnreadableError

        # A PNG signature on garbage: allowed through the sniff, refused by the decoder -- and the
        # message names the format it CLAIMED, which is what someone debugging it needs.
        (tmp_path / "broken.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"not really a png")

        with pytest.raises(ImageUnreadableError, match="as a png image"):
            self.service(tmp_path).read_image("broken.png")

    def test_posted_pixels_must_be_the_PNG_the_API_sends(self, tmp_path) -> None:
        import base64

        from lazylabel_inference.service import ImageUnreadableError

        # RULE-089's rendered pixels always arrive as PNG. Anything else is not the API's output.
        exr = base64.b64encode(b"v/1\x01" + b"\x00" * 60).decode("ascii")

        with pytest.raises(ImageUnreadableError, match="not the PNG the API sends"):
            self.service(tmp_path)._read_image(tmp_path / "unused.png", pixels=exr)


class TestTheSignatureTable:
    """One allow-list in two languages, so a format one service refuses cannot pass the other."""

    @pytest.mark.parametrize(
        ("head", "expected"),
        [
            (b"\x89PNG\r\n\x1a\n", "png"),
            (b"\xff\xd8\xff\xe0", "jpeg"),
            (b"RIFF\x00\x00\x00\x00WEBP", "webp"),
            (b"II*\x00", "tiff"),
            (b"MM\x00*", "tiff"),
            (b"GIF89a", "gif"),
            (b"GIF87a", "gif"),
            (b"BM", "bmp"),
            (b"", None),
            (b"RIFF\x00\x00\x00\x00WAVE", None),
        ],
    )
    def test_recognises_exactly_the_api_s_formats(self, head, expected) -> None:
        from lazylabel_inference.service import sniff_image_format

        assert sniff_image_format(head) == expected
