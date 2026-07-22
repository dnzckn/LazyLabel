"""Centralized theme management for LazyLabel.

The base dark/light styling (stylesheet, palette, indicator icons, standard
icons) is embedded in :mod:`.theme_data`, so no external theme package is
required at runtime.
"""

import platform
import re
import sys
import tempfile
from pathlib import Path

from PyQt6.QtCore import QPoint, QRect, QRectF, QSize, Qt
from PyQt6.QtGui import (
    QColor,
    QGuiApplication,
    QIcon,
    QIconEngine,
    QImage,
    QPainter,
    QPalette,
    QPixmap,
)
from PyQt6.QtSvg import QSvgRenderer
from PyQt6.QtWidgets import QApplication, QProxyStyle, QStyle

from ..utils.logger import logger
from .theme_data import (
    DARK_PALETTE,
    DARK_STYLESHEET,
    DARK_STYLESHEET_DARWIN,
    ICON_DIR_TOKEN,
    ICON_SVGS,
    LIGHT_PALETTE,
    LIGHT_STYLESHEET,
    LIGHT_STYLESHEET_DARWIN,
    STANDARD_ICON_MAP,
    STANDARD_ICON_SVGS,
)

_icon_dir: str | None = None
_proxy_style: "_ThemeProxyStyle | None" = None


def _ensure_icon_files() -> str | None:
    """Write the theme icon SVGs to a writable directory and return its path.

    Qt stylesheets can only reference images through ``url()`` file paths, so
    the embedded SVGs are materialized once per run. Files whose size does not
    match the embedded content (e.g. truncated by an interrupted first run) are
    rewritten. Returns None if no writable location exists (the theme still
    applies, minus indicator icons).
    """
    global _icon_dir
    if _icon_dir is not None and Path(_icon_dir).is_dir():
        return _icon_dir
    _icon_dir = None
    candidates = [
        Path.home() / ".cache" / "lazylabel" / "theme-icons",
        Path(tempfile.gettempdir()) / "lazylabel-theme-icons",
    ]
    for directory in candidates:
        try:
            directory.mkdir(parents=True, exist_ok=True)
            for name, svg in ICON_SVGS.items():
                target = directory / name
                data = svg.encode("utf-8")
                if target.exists() and target.stat().st_size == len(data):
                    continue
                tmp = directory / (name + ".tmp")
                tmp.write_bytes(data)
                tmp.replace(target)
        except OSError:
            continue
        _icon_dir = directory.as_posix()
        return _icon_dir
    return None


def _build_palette(palette_data: dict[str, dict[str, str]]) -> QPalette:
    """Build a QPalette from the explicit role colors, defaults elsewhere."""
    palette = QPalette()
    for role_name, group_colors in palette_data.items():
        role = getattr(QPalette.ColorRole, role_name, None)
        if role is None:
            continue
        for group_name, hex_color in group_colors.items():
            group = getattr(QPalette.ColorGroup, group_name)
            palette.setColor(group, role, QColor(hex_color))
    return palette


_SVG_FILL_RE = re.compile(r'fill=".*?"')
_SVG_FILL_OPACITY_RE = re.compile(r' fill-opacity=".*?"')


def _colored_svg(source: str, color: QColor) -> str:
    """Set the fill color of an SVG document (QtSvg has no #RRGGBBAA support)."""
    r, g, b, a = color.getRgb()
    if a == 255:
        new_fill = f'fill="{color.name()}"'
        new_opacity = None
    else:
        new_fill = f'fill="rgb({r},{g},{b})"'
        new_opacity = f' fill-opacity="{round(a / 255, 3)}"'

    source = _SVG_FILL_OPACITY_RE.sub("", source)
    if _SVG_FILL_RE.search(source):
        source = _SVG_FILL_RE.sub(new_fill, source, count=1)
    else:
        source = source.replace("<svg ", f"<svg {new_fill} ", 1)
    if new_opacity is not None:
        source = source.replace(" fill=", new_opacity + " fill=", 1)
    return source


def _rotated_svg(source: str, rotate: int) -> str:
    if not rotate:
        return source
    return source.replace("<svg ", f'<svg transform="rotate({rotate}, 12, 12)" ', 1)


class _SvgIconEngine(QIconEngine):
    """Render an embedded SVG, recolored from the current palette."""

    def __init__(self, source: str):
        super().__init__()
        self._source = source

    def paint(self, painter: QPainter, rect: QRect, mode: QIcon.Mode, state):
        palette = QGuiApplication.palette()
        if mode == QIcon.Mode.Disabled:
            color = palette.color(QPalette.ColorGroup.Disabled, QPalette.ColorRole.Text)
        else:
            color = palette.text().color()
        svg = _colored_svg(self._source, color)
        QSvgRenderer(svg.encode("utf-8")).render(painter, QRectF(rect))

    def clone(self):
        return _SvgIconEngine(self._source)

    def pixmap(self, size: QSize, mode: QIcon.Mode, state: QIcon.State) -> QPixmap:
        side = min(size.width(), size.height())
        img = QImage(QSize(side, side), QImage.Format.Format_ARGB32)
        img.fill(Qt.GlobalColor.transparent)
        result = QPixmap.fromImage(img, Qt.ImageConversionFlag.NoFormatConversion)
        painter = QPainter(result)
        self.paint(painter, QRect(QPoint(0, 0), QSize(side, side)), mode, state)
        painter.end()
        return result


def _standard_icon_lookup() -> dict:
    lookup = {}
    for name, spec in STANDARD_ICON_MAP.items():
        pixmap_id = getattr(QStyle.StandardPixmap, name, None)
        if pixmap_id is not None:
            lookup[pixmap_id] = spec
    return lookup


class _ThemeProxyStyle(QProxyStyle):
    """Replace standard icons (file dialogs, message boxes) with themed ones."""

    _icon_map = None

    def standardIcon(self, standard_icon, option=None, widget=None) -> QIcon:  # noqa: N802
        if _ThemeProxyStyle._icon_map is None:
            _ThemeProxyStyle._icon_map = _standard_icon_lookup()
        spec = _ThemeProxyStyle._icon_map.get(standard_icon)
        if spec is None:
            return super().standardIcon(standard_icon, option, widget)
        os_list = spec.get("os")
        if os_list is not None and platform.system() not in os_list:
            return super().standardIcon(standard_icon, option, widget)
        source = _rotated_svg(STANDARD_ICON_SVGS[spec["id"]], spec.get("rotate", 0))
        return QIcon(_SvgIconEngine(source))


def _base_stylesheet(dark: bool) -> str:
    if sys.platform == "darwin":
        return DARK_STYLESHEET_DARWIN if dark else LIGHT_STYLESHEET_DARWIN
    return DARK_STYLESHEET if dark else LIGHT_STYLESHEET


def get_additional_qss(theme: str) -> str:
    """Return LazyLabel-specific QSS layered on top of the base stylesheet."""
    if theme == "dark":
        return _DARK_QSS
    return _LIGHT_QSS


def apply_theme(theme: str) -> None:
    """Apply the dark or light theme to the running QApplication."""
    app = QApplication.instance()
    if app is None:
        return
    try:
        dark = theme == "dark"
        stylesheet = _base_stylesheet(dark)
        icon_dir = _ensure_icon_files()
        if icon_dir is not None:
            stylesheet = stylesheet.replace(ICON_DIR_TOKEN, icon_dir)
        global _proxy_style
        if _proxy_style is None and isinstance(app, QApplication):
            _proxy_style = _ThemeProxyStyle()
            app.setStyle(_proxy_style)
        app.setPalette(_build_palette(DARK_PALETTE if dark else LIGHT_PALETTE))
        app.setStyleSheet(stylesheet + get_additional_qss(theme))
    except Exception as e:
        logger.warning(f"Failed to apply theme '{theme}': {e}")


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
