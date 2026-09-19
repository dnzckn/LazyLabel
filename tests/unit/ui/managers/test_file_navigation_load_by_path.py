"""Characterization tests for the LIVE image-load path, ``load_image_by_path``.

Phase 4 entry criterion 3 of ``analysis/lazylabel/MODERNIZATION_BRIEF.md``. These exist because
``ASSESSMENT.md`` 5.5 records that today's tests cover an unreachable loader: the visible file list
(FastFileManager) calls ``load_image_by_path``, and the only tests touching this manager check how
image-adjustment parameters are passed. The path that actually loads every image a user opens had
no coverage at all.

CHARACTERIZATION, NOT SPECIFICATION. These pin down what the code does TODAY, including the parts
that are wrong, so the rewrite can be compared against something. Where a test documents a defect it
says so and names the rule card. Nothing here should be read as "this is the behaviour we want".

They are written against fakes rather than a real MainWindow because the manager reads all of its
collaborators through properties on ``self.mw``; a real window would need most of the application up
to test one method. QPixmap still needs a QGuiApplication, which conftest provides offscreen.
"""

from __future__ import annotations

from types import SimpleNamespace

import numpy as np
import pytest

from lazylabel.ui.managers.file_navigation_manager import FileNavigationManager


class FakeScene:
    def __init__(self, pixmap_item):
        self._items = [pixmap_item]
        self.removed = []

    def items(self):
        return list(self._items)

    def removeItem(self, item):  # noqa: N802 - Qt's spelling
        self.removed.append(item)
        if item in self._items:
            self._items.remove(item)


class FakeViewer:
    def __init__(self):
        self._pixmap_item = object()
        self._scene = FakeScene(self._pixmap_item)
        self.photos = []
        self.adjustments = []

    def scene(self):
        return self._scene

    def set_photo(self, pixmap):
        self.photos.append(pixmap)

    def set_image_adjustments(self, *values):
        self.adjustments.append(values)


class FakeFileManager:
    def __init__(self, raises: Exception | None = None):
        self.calls = []
        self.raises = raises

    def load_existing_mask(self, path, image_size=None):
        self.calls.append((path, image_size))
        if self.raises is not None:
            raise self.raises


def make_window(*, current_image_path: str = "", auto_save: bool = True, **overrides):
    """A MainWindow with exactly the surface ``load_image_by_path`` touches."""
    viewer = FakeViewer()
    window = SimpleNamespace(
        view_mode="single",
        current_image_path=current_image_path,
        original_image=None,
        active_viewer=viewer,
        segment_manager=SimpleNamespace(clear=_recorder("segments_cleared")),
        file_manager=FakeFileManager(),
        control_panel=SimpleNamespace(get_settings=lambda: {"auto_save": auto_save}),
        image_adjustment_manager=SimpleNamespace(brightness=1.0, contrast=2.0, gamma=3.0, saturation=4.0),
        image_preload_manager=SimpleNamespace(preload_adjacent_images=_recorder("preloaded")),
        right_panel=SimpleNamespace(select_file=_recorder("selected")),
        sam_worker_manager=SimpleNamespace(try_cache_restore=lambda: True),
        sam_is_dirty=False,
        get_cached_sequence_image=lambda path: None,
        calls=[],
    )
    for name in (
        "_save_output_to_npz",
        "_reset_state",
        "_update_all_lists",
        "_update_display",
        "_show_success_notification",
        "_update_sam_model_image",
        "_update_channel_threshold_for_image",
    ):
        setattr(window, name, _recorder(name, window))
    for key, value in overrides.items():
        setattr(window, key, value)
    return window


def _recorder(name, window=None):
    calls = []

    def record(*args, **kwargs):
        calls.append((args, kwargs))
        if window is not None:
            window.calls.append(name)

    record.calls = calls
    return record


@pytest.fixture
def bgr_image(tmp_path):
    """A 4x6 image with a known, asymmetric colour so a BGR/RGB swap is visible."""
    import cv2

    path = tmp_path / "frame.png"
    array = np.zeros((4, 6, 3), dtype=np.uint8)
    array[:, :] = (10, 20, 30)  # BGR on disk
    cv2.imwrite(str(path), array)
    return str(path)


@pytest.mark.usefixtures("qapp")
class TestLoadImageByPath:
    def test_loads_an_image_and_converts_bgr_to_rgb(self, bgr_image):
        window = make_window()
        FileNavigationManager(window).load_image_by_path(bgr_image)

        assert window.current_image_path == bgr_image
        # Written as BGR (10, 20, 30); held in memory as RGB (30, 20, 10).
        assert tuple(window.original_image[0, 0]) == (30, 20, 10)
        assert len(window.active_viewer.photos) == 1

    def test_does_nothing_when_the_path_is_already_open(self, bgr_image):
        window = make_window(current_image_path=bgr_image)
        FileNavigationManager(window).load_image_by_path(bgr_image)

        assert window.calls == []
        assert window.active_viewer.photos == []

    def test_auto_saves_the_previous_image_before_switching(self, bgr_image, tmp_path):
        window = make_window(current_image_path=str(tmp_path / "previous.png"), auto_save=True)
        FileNavigationManager(window).load_image_by_path(bgr_image)

        assert "_save_output_to_npz" in window.calls

    def test_does_not_auto_save_on_the_very_first_load(self, bgr_image):
        # current_image_path is empty, so there is nothing to save. A port that saves here would
        # write an empty annotation set over whatever the first image already had.
        window = make_window(current_image_path="")
        FileNavigationManager(window).load_image_by_path(bgr_image)

        assert "_save_output_to_npz" not in window.calls

    def test_does_not_auto_save_when_the_setting_is_off(self, bgr_image, tmp_path):
        window = make_window(current_image_path=str(tmp_path / "previous.png"), auto_save=False)
        FileNavigationManager(window).load_image_by_path(bgr_image)

        assert "_save_output_to_npz" not in window.calls

    def test_resets_state_and_clears_segments(self, bgr_image):
        window = make_window()
        FileNavigationManager(window).load_image_by_path(bgr_image)

        assert "_reset_state" in window.calls
        assert window.segment_manager.clear.calls

    def test_clears_every_scene_item_except_the_pixmap(self, bgr_image):
        window = make_window()
        viewer = window.active_viewer
        stray = object()
        viewer._scene._items.append(stray)

        FileNavigationManager(window).load_image_by_path(bgr_image)

        assert viewer._scene.removed == [stray]
        assert viewer._pixmap_item in viewer._scene.items()

    def test_prefers_the_memory_cache_over_reading_the_file(self, bgr_image):
        cached = np.full((2, 3, 3), 99, dtype=np.uint8)
        window = make_window(get_cached_sequence_image=lambda path: cached)

        FileNavigationManager(window).load_image_by_path(bgr_image)

        # The cache holds RGB already, so it is used verbatim - no second conversion.
        assert window.original_image is cached
        assert tuple(window.original_image[0, 0]) == (99, 99, 99)

    def test_loads_annotations_with_the_pixmap_size(self, bgr_image):
        window = make_window()
        FileNavigationManager(window).load_image_by_path(bgr_image)

        assert len(window.file_manager.calls) == 1
        path, size = window.file_manager.calls[0]
        assert path == bgr_image
        assert size == (4, 6)  # (height, width), from the pixmap

    def test_a_damaged_annotation_file_does_not_abort_the_image_load(self, bgr_image):
        window = make_window(file_manager=FakeFileManager(raises=ValueError("corrupt sidecar")))
        FileNavigationManager(window).load_image_by_path(bgr_image)

        # The code has an explicit guard for this, and it is the right call: the image still opens.
        assert window.active_viewer.photos
        assert "_update_all_lists" in window.calls

    def test_passes_the_current_adjustments_to_the_new_image(self, bgr_image):
        window = make_window()
        FileNavigationManager(window).load_image_by_path(bgr_image)

        assert window.active_viewer.adjustments == [(1.0, 2.0, 3.0, 4.0)]


@pytest.mark.usefixtures("qapp")
class TestDefectsThisPathCarries:
    """Behaviour the rewrite must NOT reproduce. Pinned so the difference is deliberate."""

    def test_a_failed_load_leaves_the_app_pointing_at_an_image_it_never_opened(self, tmp_path):
        """The most dangerous line in the method, and it is an ordering mistake.

        ``self.mw.current_image_path = path`` runs BEFORE the read. When ``cv2.imread`` returns None
        the method logs and returns - but the path has already moved, the previous image's pixmap is
        still on screen, and the segments have already been cleared.

        So the application now believes it is on an image it never loaded, showing the previous
        image, with no segments. The next navigation auto-saves that empty state to the NEW image's
        sidecars, destroying annotations the user never opened. Decision 7 removes the silent save
        that completes this, and the rewrite must also not move its current-image pointer until the
        image is actually in hand.
        """
        import cv2

        not_an_image = tmp_path / "broken.png"
        not_an_image.write_bytes(b"this is not a PNG")
        assert cv2.imread(str(not_an_image)) is None, "fixture is not actually undecodable"

        previous = str(tmp_path / "previous.png")
        window = make_window(current_image_path=previous, auto_save=False)

        FileNavigationManager(window).load_image_by_path(str(not_an_image))

        # The pointer moved even though nothing loaded.
        assert window.current_image_path == str(not_an_image)
        # Nothing was drawn, and the segments are already gone.
        assert window.active_viewer.photos == []
        assert window.segment_manager.clear.calls
        # And no annotations were loaded for it, so the state is empty and looks saveable.
        assert window.file_manager.calls == []

    def test_the_crop_is_never_restored_on_this_path(self, bgr_image):
        """RULE-067: ``crop_coords_by_size`` implies crops carry to same-sized images, and this
        path - the one the visible file list uses - never restores one.

        Decision 9 settles it by removing the persistence rather than finishing it, so the rewrite
        matches this path's behaviour and not the other one's. Pinned because the two legacy paths
        disagree, and a port could faithfully reproduce either.
        """
        window = make_window(crop_manager=SimpleNamespace(restore_crop_for_size=_recorder("crop")))
        FileNavigationManager(window).load_image_by_path(bgr_image)

        assert window.crop_manager.restore_crop_for_size.calls == []
