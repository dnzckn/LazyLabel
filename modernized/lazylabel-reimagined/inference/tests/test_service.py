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


def test_a_changed_processing_chain_is_a_new_encoding_not_a_cached_one(tmp_path):
    """RULE-089 with the processing chain.

    Legacy segments the PROCESSED view, so a new rescale is a new picture. Until 2026-09-23 the key
    held the adjustments alone, and a changed rescale under unchanged adjustments answered from the
    old encoding: a mask of a picture no longer on screen, with no sign anything was wrong.
    """
    import base64
    import io

    from PIL import Image

    from lazylabel_inference.manifest import ModelEntry
    from lazylabel_inference.service import InferenceService

    class Encoder:
        """Stands where SAM does; counts what it is asked to encode."""

        encoded = 0
        entry = ModelEntry(name="m", family="sam2", size="tiny", filename="m.pt", sha256="0" * 64, bytes=1)

        def set_image(self, image) -> None:
            Encoder.encoded += 1

        def export_state(self):
            return object()

        def restore_state(self, state) -> None:
            pass

    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), (10, 200, 30)).save(buffer, format="PNG")
    (tmp_path / "a.png").write_bytes(buffer.getvalue())
    posted = base64.b64encode(buffer.getvalue()).decode()

    entry = ModelEntry(name="m", family="sam2", size="tiny", filename="m.pt", sha256="0" * 64, bytes=1)
    service = InferenceService(models=[entry], model_dir=tmp_path, dataset_root=tmp_path)
    service._backends["m"] = Encoder()

    view = {"brightness": 40.0}
    first, first_cached = service.embed("a.png", "m", view, posted, "rescaleMin=10&rescaleMax=200")
    again, again_cached = service.embed("a.png", "m", view, posted, "rescaleMin=10&rescaleMax=200")
    other, other_cached = service.embed("a.png", "m", view, posted, "rescaleMin=20&rescaleMax=200")

    assert (first_cached, again_cached, other_cached) == (False, True, False)
    assert first == again != other
    assert Encoder.encoded == 2


class OneImagePredictor:
    """Stands where SAM does, with the property that matters here: it holds ONE encoded image.

    A prediction reports the image it was answered from, so answering from the wrong one shows.
    """

    def __init__(self) -> None:
        from lazylabel_inference.manifest import ModelEntry

        self.entry = ModelEntry(name="m", family="sam2", size="tiny", filename="m.pt", sha256="0" * 64, bytes=1)
        self.holding = None
        self.encoded = 0

    def set_image(self, image) -> None:
        self.holding = int(image[0, 0, 0])
        self.encoded += 1

    def export_state(self):
        return self.holding

    def restore_state(self, state) -> None:
        self.holding = state

    def predict(self, prompt):
        from lazylabel_inference.prompts import Prediction

        return Prediction(mask=None, score=float(self.holding))


def _same_sized_pair(tmp_path, service_for):
    """Two images of one size and different content -- a folder's normal case."""
    from PIL import Image

    Image.new("RGB", (8, 6), (10, 10, 10)).save(tmp_path / "a.png")
    Image.new("RGB", (8, 6), (200, 200, 200)).save(tmp_path / "b.png")
    predictor = OneImagePredictor()
    service = service_for(tmp_path)
    service._backends["m"] = predictor
    return service, predictor


def _service_for(root):
    from lazylabel_inference.manifest import ModelEntry
    from lazylabel_inference.service import InferenceService

    entry = ModelEntry(name="m", family="sam2", size="tiny", filename="m.pt", sha256="0" * 64, bytes=1)
    return InferenceService(models=[entry], model_dir=root, dataset_root=root)


def test_a_click_is_answered_from_its_own_image_after_a_neighbour_is_encoded(tmp_path):
    """RULE-091 encodes the neighbours; a click on the open image must still be about THAT image.

    Reproduced on 2026-09-23 with SAM 2.1 large: a click on a disc gave the disc (20,031 pixels)
    until a same-sized neighbour was encoded, then 286,131 -- the neighbour's background. The check
    was on the image's size, which every neighbour in a folder of one size passes.
    """
    from lazylabel_inference.prompts import Point, Prompt

    service, predictor = _same_sized_pair(tmp_path, _service_for)
    click = Prompt(points=(Point(1, 1),))

    a, _ = service.embed("a.png", "m")
    service.embed("b.png", "m")  # what the prefetch does next

    assert service.segment(a, click).score == 10.0
    # Put back from the cache, not encoded again: RULE-091's whole point is not paying for it twice.
    assert predictor.encoded == 2


def test_asking_again_for_an_image_that_is_cached_still_answers_from_it(tmp_path):
    """The client's recovery path. It said `cached` and changed nothing until 2026-09-23."""
    from lazylabel_inference.prompts import Point, Prompt

    service, predictor = _same_sized_pair(tmp_path, _service_for)
    click = Prompt(points=(Point(1, 1),))

    service.embed("a.png", "m")
    b, _ = service.embed("b.png", "m")
    again, cached = service.embed("a.png", "m")

    assert cached is True
    assert service.segment(again, click).score == 10.0
    assert service.segment(b, click).score == 200.0
    assert predictor.encoded == 2


def test_an_encode_that_fails_partway_does_not_leave_a_stale_record(tmp_path):
    """A failed encode has already reset the predictor. The next click on the image it held must
    put that image back, not trust a record saying it is still there."""
    from lazylabel_inference.prompts import Point, Prompt

    service, predictor = _same_sized_pair(tmp_path, _service_for)
    click = Prompt(points=(Point(1, 1),))
    a, _ = service.embed("a.png", "m")

    def fails_partway(image) -> None:
        predictor.holding = None  # what a real predictor's reset leaves
        raise RuntimeError("out of memory")

    predictor.set_image = fails_partway
    with pytest.raises(RuntimeError):
        service.embed("b.png", "m")

    assert service.segment(a, click).score == 10.0


def test_two_first_requests_load_the_model_once(tmp_path, monkeypatch):
    """The server is threaded. Two first requests loading one model at once failed inside torch on
    2026-09-23 -- a 500 the browser showed as "the AI tools could not prepare this image"."""
    import threading
    import time

    from lazylabel_inference import service as service_module

    loads = []

    def slow_load(entry, model_dir, device=None):
        loads.append(entry.name)
        time.sleep(0.2)
        return OneImagePredictor()

    monkeypatch.setattr(service_module, "load_backend", slow_load)
    service = _service_for(tmp_path)
    monkeypatch.setattr(service, "verified", lambda entry: entry)

    threads = [threading.Thread(target=service.backend, args=("m",)) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert loads == ["m"]


def test_the_archetype_embedder_is_refused_as_a_segmenter_and_says_so(tmp_path):
    """It shares the manifest with the SAM checkpoints. Chosen for the AI tool, it failed with "no
    backend for family 'embedder'" until 2026-09-23; now the refusal names what to do instead."""
    from PIL import Image

    from lazylabel_inference.manifest import ModelEntry
    from lazylabel_inference.prompts import InvalidPromptError
    from lazylabel_inference.service import InferenceService

    Image.new("RGB", (4, 4)).save(tmp_path / "a.png")
    embedder = ModelEntry(name="MobileNetV3 small", family="embedder", size="mobilenet_v3_small",
                          filename="m.pth", sha256="0" * 64, bytes=1)
    service = InferenceService(models=[embedder], model_dir=tmp_path, dataset_root=tmp_path)

    with pytest.raises(InvalidPromptError, match="cannot segment.*choose a SAM model"):
        service.embed("a.png", "MobileNetV3 small")


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


class TestReadingAFrameForPropagation:
    """SEQUENCE_PARITY.md SP-08: a JPEG frame comes with its own bytes, which SAM 2 is then given.

    Legacy stages a JPEG by linking or copying the file and writes anything else again at quality 95
    (`sam2_model.py:788-803`). It decides by NAME. This decides by name and by CONTENT: the bytes
    handed on are the ones SEC-02 sniffed and the decoder read, so a file named `.jpg` that holds
    another format is written again, where legacy would pass it to SAM 2 as it is.
    """

    def service(self, root):
        from lazylabel_inference.service import InferenceService

        return InferenceService(models=[], model_dir=root, dataset_root=root)

    def encoded(self, suffix: str) -> bytes:
        import cv2
        import numpy as np

        picture = np.zeros((6, 8, 3), dtype=np.uint8)
        picture[1:5, 2:6] = (40, 90, 200)
        return cv2.imencode(suffix, picture)[1].tobytes()

    @pytest.mark.parametrize("name", ["a.jpg", "b.jpeg", "C.JPG", "d.JpEg"])
    def test_a_jpeg_comes_with_the_file_s_own_bytes(self, tmp_path, name) -> None:
        # Any case: legacy lower-cases the suffix before it looks (`sam2_model.py:788`).
        data = self.encoded(".jpg")
        (tmp_path / name).write_bytes(data)

        frame = self.service(tmp_path).read_frame(name)

        assert frame.jpeg == data
        # Decoded as well, for RULE-071's size check, and as `read_image` decodes it.
        assert frame.pixels.shape == (6, 8, 3)
        assert (frame.pixels == self.service(tmp_path).read_image(name)).all()

    @pytest.mark.parametrize(("name", "suffix"), [("a.png", ".png"), ("b.bmp", ".bmp"), ("c.tif", ".tif")])
    def test_anything_else_comes_as_pixels_alone(self, tmp_path, name, suffix) -> None:
        (tmp_path / name).write_bytes(self.encoded(suffix))

        frame = self.service(tmp_path).read_frame(name)

        assert frame.jpeg is None
        assert frame.pixels.shape == (6, 8, 3)

    def test_a_png_called_jpg_is_not_passed_on_as_a_jpeg(self, tmp_path) -> None:
        # Legacy would give these bytes to SAM 2's Pillow as they are. Here the content decides
        # what reaches a decoder, so they are decoded like any PNG and written again.
        (tmp_path / "misnamed.jpg").write_bytes(self.encoded(".png"))

        frame = self.service(tmp_path).read_frame("misnamed.jpg")

        assert frame.jpeg is None

    def test_a_jpeg_called_png_is_written_again_as_legacy_writes_it(self, tmp_path) -> None:
        # Legacy goes by the name, so it decodes this with `cv2.imread` and writes it at quality 95.
        (tmp_path / "misnamed.png").write_bytes(self.encoded(".jpg"))

        frame = self.service(tmp_path).read_frame("misnamed.png")

        assert frame.jpeg is None

    def test_it_is_refused_on_the_same_terms_as_read_image(self, tmp_path) -> None:
        from lazylabel_inference.prompts import InvalidPromptError
        from lazylabel_inference.service import ImageUnreadableError

        (tmp_path / "x.jpg").write_bytes(b"v/1\x01" + b"\x00" * 60)

        with pytest.raises(ImageUnreadableError, match="not an image type LazyLabel opens"):
            self.service(tmp_path).read_frame("x.jpg")
        with pytest.raises(InvalidPromptError, match="walks the tree"):
            self.service(tmp_path).read_frame("../x.jpg")


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
