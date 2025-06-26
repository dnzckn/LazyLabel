"""Main entry point for LazyLabel application."""

import sys
import qdarktheme
from PyQt6.QtWidgets import QApplication

from .ui.main_window import MainWindow


def main():
    """Main application entry point."""
    print("=" * 50)
    print("LazyLabel - AI-Assisted Image Labeling")
    print("=" * 50)
    print()

    print("[1/20] Initializing application...")
    app = QApplication(sys.argv)

    print("[2/20] Applying dark theme...")
    qdarktheme.setup_theme()

    main_window = MainWindow()

    print("[19/20] Showing main window...")
    main_window.show()

    print()
    print("[20/20] LazyLabel is ready! Happy labeling!")
    print("=" * 50)

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
