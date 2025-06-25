"""Main entry point for LazyLabel application."""

import sys
import qdarktheme
from PyQt6.QtWidgets import QApplication

from .ui.main_window import MainWindow


def main():
    """Main application entry point."""
    app = QApplication(sys.argv)
    qdarktheme.setup_theme()
    
    main_window = MainWindow()
    main_window.show()
    
    sys.exit(app.exec())


if __name__ == "__main__":
    main()