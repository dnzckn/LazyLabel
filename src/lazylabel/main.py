"""Main entry point for LazyLabel application."""

import os
import sys

# PyInstaller with console=False sets sys.stdout/stderr to None,
# which crashes libraries like tqdm that write to them.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")  # noqa: SIM115
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")  # noqa: SIM115

from lazylabel.utils.logger import logger
from lazylabel.utils.startup import startup_display


def main():
    """Main application entry point."""

    startup_display.show_banner()

    logger.info("LazyLabel - AI-Assisted Image Labeling")

    startup_display.update_step(2, "Initializing application")
    logger.info("Initializing application...")
    from PyQt6.QtWidgets import QApplication

    app = QApplication(sys.argv)

    startup_display.update_step(3, "Applying theme")
    logger.info("Applying theme...")
    try:
        from lazylabel.config.paths import AppPaths
        from lazylabel.config.settings import Settings
        from lazylabel.ui.theme import apply_theme

        paths = AppPaths()
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

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
