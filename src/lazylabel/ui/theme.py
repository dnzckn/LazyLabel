"""Centralized theme management for LazyLabel."""


def get_additional_qss(theme: str) -> str:
    """Return additional QSS to layer on top of qdarktheme."""
    if theme == "dark":
        return _DARK_QSS
    return _LIGHT_QSS


def apply_theme(theme: str) -> None:
    """Apply qdarktheme with custom additional QSS."""
    try:
        import qdarktheme

        qdarktheme.setup_theme(theme, additional_qss=get_additional_qss(theme))
    except Exception:
        pass


_SHARED_QSS = """
/* Mode and utility buttons */
QPushButton#modeButton {
    font-weight: bold;
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 4px;
}

/* Accent toggle buttons (auto-polygon etc) */
QPushButton#accentButton {
    font-weight: bold;
    font-size: 11px;
    padding: 6px 12px;
    border-radius: 4px;
}

/* Professional card containers */
QFrame#professionalCard {
    border-radius: 6px;
    padding: 4px;
}

/* Collapsible section headers */
QWidget#collapsibleHeader {
    border-radius: 3px;
    padding: 1px 2px;
}

/* Notification label */
QLabel#notificationLabel {
    color: #FFA500;
    font-style: italic;
}
"""

_DARK_QSS = (
    _SHARED_QSS
    + """
/* Mode buttons - checked state (dark) */
QPushButton#modeButton:checked {
    background-color: rgba(92, 143, 191, 0.9);
    border: 2px solid rgba(122, 175, 212, 1.0);
    color: #FFFFFF;
}
QPushButton#modeButton:checked:hover {
    background-color: rgba(110, 160, 210, 0.95);
    border: 2px solid rgba(140, 190, 225, 1.0);
}

/* Accent button - checked state (dark) */
QPushButton#accentButton:checked {
    background-color: rgba(123, 94, 167, 0.9);
    border: 2px solid rgba(155, 126, 199, 1.0);
    color: #FFFFFF;
}
QPushButton#accentButton:checked:hover {
    background-color: rgba(140, 112, 185, 0.95);
}

/* Positive action buttons - green (dark) */
QPushButton#positiveButton {
    background-color: rgba(76, 175, 80, 0.85);
    border: 1px solid rgba(100, 200, 104, 0.9);
    color: #FFFFFF;
    font-weight: bold;
}
QPushButton#positiveButton:hover {
    background-color: rgba(92, 190, 96, 0.9);
}
QPushButton#positiveButton:disabled {
    background-color: rgba(76, 175, 80, 0.3);
    color: rgba(255, 255, 255, 0.5);
}

/* Professional card - subtle raised look (dark) */
QFrame#professionalCard {
    background-color: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
}

/* Collapsible headers (dark) */
QWidget#collapsibleHeader {
    background-color: rgba(255, 255, 255, 0.04);
}
QWidget#collapsibleHeader:hover {
    background-color: rgba(255, 255, 255, 0.08);
}
"""
)

_LIGHT_QSS = (
    _SHARED_QSS
    + """
/* Mode buttons - checked state (light) */
QPushButton#modeButton:checked {
    background-color: rgba(46, 109, 164, 0.9);
    border: 2px solid rgba(74, 142, 194, 1.0);
    color: #FFFFFF;
}
QPushButton#modeButton:checked:hover {
    background-color: rgba(60, 125, 180, 0.95);
    border: 2px solid rgba(85, 155, 205, 1.0);
}

/* Accent button - checked state (light) */
QPushButton#accentButton:checked {
    background-color: rgba(107, 63, 160, 0.9);
    border: 2px solid rgba(140, 95, 195, 1.0);
    color: #FFFFFF;
}
QPushButton#accentButton:checked:hover {
    background-color: rgba(120, 78, 175, 0.95);
}

/* Positive action buttons - green (light) */
QPushButton#positiveButton {
    background-color: rgba(56, 142, 60, 0.9);
    border: 1px solid rgba(76, 165, 80, 0.95);
    color: #FFFFFF;
    font-weight: bold;
}
QPushButton#positiveButton:hover {
    background-color: rgba(70, 158, 74, 0.95);
}
QPushButton#positiveButton:disabled {
    background-color: rgba(56, 142, 60, 0.3);
    color: rgba(255, 255, 255, 0.6);
}

/* Professional card - subtle raised look (light) */
QFrame#professionalCard {
    background-color: rgba(0, 0, 0, 0.03);
    border: 1px solid rgba(0, 0, 0, 0.08);
}

/* Collapsible headers (light) */
QWidget#collapsibleHeader {
    background-color: rgba(0, 0, 0, 0.04);
}
QWidget#collapsibleHeader:hover {
    background-color: rgba(0, 0, 0, 0.08);
}
"""
)
