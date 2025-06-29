"""Main entry point for LazyLabel application."""

import sys

import qdarktheme
from PyQt6.QtWidgets import QApplication

from .ui.main_window import MainWindow
from .utils.logger import logger


def main():
    """Main application entry point."""

    logger.info("=" * 50)
    logger.info("Step 1/8: LazyLabel - AI-Assisted Image Labeling")
    logger.info("=" * 50)
    logger.info("")

    logger.info("Step 2/8: Initializing application...")
    app = QApplication(sys.argv)

    logger.info("Step 3/8: Applying dark theme...")
    qdarktheme.setup_theme()

    main_window = MainWindow()

    logger.info("Step 7/8: Showing main window...")
    main_window.show()

    logger.info("")
    logger.info("Step 8/8: LazyLabel is ready! Happy labeling!")
    logger.info("=" * 50)

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
