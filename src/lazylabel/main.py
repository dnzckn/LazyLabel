"""Main entry point for LazyLabel application."""

import contextlib
import os
import sys

# PyInstaller with console=False sets sys.stdout/stderr to None,
# which crashes libraries like tqdm that write to them.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")  # noqa: SIM115
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")  # noqa: SIM115

# Under WSL, Qt's default Wayland plugin frequently hangs on QApplication()
# because WSLg's Wayland socket is unreliable. Force xcb (X11), which works
# via XWayland. Skip if the user has explicitly chosen a platform.
if (
    sys.platform == "linux"
    and "QT_QPA_PLATFORM" not in os.environ
    and os.environ.get("WSL_DISTRO_NAME")
):
    os.environ["QT_QPA_PLATFORM"] = "xcb"

from lazylabel.utils.logger import logger
from lazylabel.utils.startup import startup_display


def _force_utf8_streams() -> None:
    """Reconfigure the console text streams to UTF-8 so startup output can't crash.

    A frozen Windows console build often exposes stdout/stderr using the legacy
    code page (typically cp1252), which cannot encode the box-drawing characters
    used by the startup banner and the styled logger. Writing them would raise
    UnicodeEncodeError and abort the app before the GUI appears. Reconfiguring to
    UTF-8 lets the art render (real Windows consoles output via WriteConsoleW);
    where reconfigure is unavailable, StartupDisplay._write degrades gracefully.

    Called from main() rather than at import time so that merely importing the
    package never mutates an embedder's global streams.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            with contextlib.suppress(Exception):
                reconfigure(encoding="utf-8", errors="replace")


def main():
    """Main application entry point."""
    _force_utf8_streams()

    try:
        startup_display.show_banner()

        logger.info("LazyLabel - AI-Assisted Image Labeling")

        startup_display.update_step(2, "Initializing application")
        logger.info("Initializing application...")
        from PyQt6.QtWidgets import QApplication

        app = QApplication(sys.argv)

        startup_display.update_step(3, "Applying theme")
        logger.info("Applying theme...")
        try:
            from lazylabel.config.paths import Paths
            from lazylabel.config.settings import Settings
            from lazylabel.ui.theme import apply_theme

            paths = Paths()
            settings = Settings.load_from_file(str(paths.settings_file))
            theme = "dark" if settings.dark_mode else "light"
            apply_theme(theme)
        except Exception as e:
            logger.warning(f"Could not apply theme: {e}")

        startup_display.update_step(4, "Setting up main window")
        logger.info("Setting up main window...")
        from lazylabel.ui.main_window import MainWindow

        main_window = MainWindow()

        startup_display.update_step(7, "Showing main window")
        logger.info("Showing main window...")
        main_window.show()

        logger.info("LazyLabel is ready!")
        startup_display.finish()
    except Exception:
        # If startup fails while the banner has stdout/stderr captured, restore
        # them first so the traceback is visible instead of written to devnull.
        startup_display._release_output()
        raise

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
