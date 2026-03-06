"""Main entry point for LazyLabel application."""

import os
import sys

# PyInstaller with console=False sets sys.stdout/stderr to None,
# which crashes libraries like tqdm that write to them.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")  # noqa: SIM115
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")  # noqa: SIM115

from PyQt6.QtWidgets import QApplication

from lazylabel.ui.main_window import MainWindow
from lazylabel.utils.logger import logger


def main():
    """Main application entry point."""

    logger.info("=" * 50)
    logger.info("Step 1/8: LazyLabel - AI-Assisted Image Labeling")
    logger.info("=" * 50)
    logger.info("")

    logger.info("Step 2/8: Initializing application...")
    app = QApplication(sys.argv)

    logger.info("Step 3/8: Applying dark theme...")
    try:
        import qdarktheme

        qdarktheme.setup_theme()
    except Exception as e:
        logger.warning(f"Could not apply dark theme: {e}")
        logger.info("Falling back to default Qt style")

    logger.info("Step 4/8: Setting up main window...")
    main_window = MainWindow()

    logger.info("Step 7/8: Showing main window...")
    main_window.show()

    logger.info("")
    logger.info("Step 8/8: LazyLabel is ready! Happy labeling!")
    logger.info("=" * 50)

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
