"""Tests for the animated startup display, focused on console encoding safety.

The startup banner and progress bar are drawn with box-drawing glyphs
(``█``, ``━``, ``─``). On a frozen Windows console build the
attached ``sys.stdout`` uses the legacy cp1252 code page, which cannot encode
those characters. Historically this raised ``UnicodeEncodeError`` inside
``_write`` and aborted the whole application before the GUI appeared. These
tests lock in the guarantee that a non-UTF-8 console degrades gracefully
instead of crashing, while a UTF-8 console still renders the art intact.
"""

import io
import sys

from lazylabel.utils.startup import _LOGO, StartupDisplay


def _text_stream(encoding: str):
    """A real text stream backed by bytes, mimicking a console with *encoding*."""
    raw = io.BytesIO()
    return io.TextIOWrapper(raw, encoding=encoding, newline=""), raw


def test_write_survives_cp1252_console():
    """Box-drawing art must not crash a legacy cp1252 console."""
    display = StartupDisplay()
    stream, raw = _text_stream("cp1252")
    display._real_stdout = stream

    # Without the guard this raises UnicodeEncodeError on the first block glyph.
    display._write(_LOGO)
    stream.flush()

    written = raw.getvalue()
    assert written  # something was emitted
    assert b"?" in written  # unencodable glyphs were replaced, not raised


def test_write_preserves_art_on_utf8_console():
    """A UTF-8 console keeps the original glyphs intact."""
    display = StartupDisplay()
    stream, raw = _text_stream("utf-8")
    display._real_stdout = stream

    display._write(_LOGO)
    stream.flush()

    assert "█" in raw.getvalue().decode("utf-8")


def test_write_flushes_after_fallback():
    """The fallback path still flushes so frames are not buffered indefinitely."""
    flushed = {"count": 0}

    class _Cp1252Recorder:
        encoding = "cp1252"

        def write(self, s: str) -> None:
            s.encode(self.encoding)  # raises on box glyphs, like a real console

        def flush(self) -> None:
            flushed["count"] += 1

    display = StartupDisplay()
    display._real_stdout = _Cp1252Recorder()

    display._write(_LOGO)  # should swallow the UnicodeEncodeError and still flush
    assert flushed["count"] == 1


def test_capture_output_uses_utf8_devnull():
    """While the banner is drawn, redirected output must accept Unicode.

    _capture_output points sys.stdout/stderr at devnull; if that stream used a
    legacy code page, a library printing Unicode during startup would crash the
    app. It must be UTF-8 regardless of the host locale.
    """
    display = StartupDisplay()
    display._capture_output()
    try:
        assert (sys.stdout.encoding or "").lower() == "utf-8"
        sys.stdout.write("█━─│")  # box glyphs must not raise
        sys.stdout.flush()
    finally:
        display._release_output()


def test_force_utf8_streams_reconfigures_legacy_console(monkeypatch):
    """main._force_utf8_streams flips a cp1252 console to UTF-8."""
    from lazylabel.main import _force_utf8_streams

    out = io.TextIOWrapper(io.BytesIO(), encoding="cp1252")
    err = io.TextIOWrapper(io.BytesIO(), encoding="cp1252")
    monkeypatch.setattr(sys, "stdout", out)
    monkeypatch.setattr(sys, "stderr", err)

    _force_utf8_streams()

    assert out.encoding == "utf-8"
    assert err.encoding == "utf-8"
    # And the box-drawing art now encodes without raising.
    out.write(_LOGO)
    out.flush()
