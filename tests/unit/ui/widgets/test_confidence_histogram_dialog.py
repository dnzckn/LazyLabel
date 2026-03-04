"""Tests for ConfidenceHistogramDialog and ConfidenceHistogramWidget."""

import pytest
from PyQt6.QtCore import QPoint, Qt

from lazylabel.ui.widgets.confidence_histogram_dialog import (
    ConfidenceHistogramDialog,
    ConfidenceHistogramWidget,
)


@pytest.fixture
def sample_scores():
    """Sample confidence scores for testing."""
    return [0.1, 0.3, 0.5, 0.7, 0.85, 0.9, 0.95, 0.98, 0.99, 1.0]


@pytest.fixture
def histogram_widget(qtbot, sample_scores):
    """Fixture for ConfidenceHistogramWidget."""
    widget = ConfidenceHistogramWidget(sample_scores, threshold=0.9)
    qtbot.addWidget(widget)
    widget.resize(500, 300)
    widget.show()
    return widget


@pytest.fixture
def histogram_dialog(qtbot, sample_scores):
    """Fixture for ConfidenceHistogramDialog."""
    dialog = ConfidenceHistogramDialog(sample_scores, threshold=0.9)
    qtbot.addWidget(dialog)
    return dialog


class TestConfidenceHistogramWidgetCreation:
    """Tests for widget creation."""

    def test_widget_creates_successfully(self, histogram_widget):
        assert histogram_widget is not None

    def test_initial_threshold(self, histogram_widget):
        assert histogram_widget.threshold == 0.9

    def test_minimum_size(self, histogram_widget):
        assert histogram_widget.minimumWidth() >= 400
        assert histogram_widget.minimumHeight() >= 250

    def test_bins_computed(self, histogram_widget):
        assert len(histogram_widget._bins) == 50
        assert sum(histogram_widget._bins) == 10  # 10 sample scores


class TestConfidenceHistogramWidgetThreshold:
    """Tests for threshold behaviour."""

    def test_threshold_clamped_low(self, qtbot):
        w = ConfidenceHistogramWidget([0.5], threshold=-0.5)
        qtbot.addWidget(w)
        assert w.threshold == 0.0

    def test_threshold_clamped_high(self, qtbot):
        w = ConfidenceHistogramWidget([0.5], threshold=1.5)
        qtbot.addWidget(w)
        assert w.threshold == 1.0

    def test_threshold_changed_signal_on_drag(self, histogram_widget, qtbot):
        """Test that dragging near the threshold line emits signal."""
        from unittest.mock import MagicMock

        # Start drag near threshold line
        tx = histogram_widget._threshold_x()
        histogram_widget._dragging = True

        received = []
        histogram_widget.threshold_changed.connect(lambda v: received.append(v))

        # Simulate mouse move during drag
        event = MagicMock()
        event.pos.return_value = QPoint(int(tx + 20), 100)
        histogram_widget.mouseMoveEvent(event)

        assert len(received) == 1
        assert 0.0 <= received[0] <= 1.0

    def test_mouse_release_stops_drag(self, histogram_widget, qtbot):
        from unittest.mock import MagicMock

        histogram_widget._dragging = True
        event = MagicMock()
        event.button.return_value = Qt.MouseButton.LeftButton
        histogram_widget.mouseReleaseEvent(event)
        assert histogram_widget._dragging is False


class TestConfidenceHistogramWidgetPaint:
    """Tests for paint event."""

    def test_paint_does_not_crash(self, histogram_widget):
        histogram_widget.repaint()

    def test_paint_with_empty_scores(self, qtbot):
        w = ConfidenceHistogramWidget([], threshold=0.5)
        qtbot.addWidget(w)
        w.resize(400, 250)
        w.show()
        w.repaint()  # Should not crash

    def test_paint_with_all_same_scores(self, qtbot):
        w = ConfidenceHistogramWidget([0.5] * 100, threshold=0.5)
        qtbot.addWidget(w)
        w.resize(400, 250)
        w.show()
        w.repaint()


class TestConfidenceHistogramDialog:
    """Tests for the dialog."""

    def test_dialog_creates_successfully(self, histogram_dialog):
        assert histogram_dialog is not None

    def test_dialog_minimum_size(self, histogram_dialog):
        assert histogram_dialog.minimumWidth() >= 500
        assert histogram_dialog.minimumHeight() >= 350

    def test_dialog_title(self, histogram_dialog):
        assert "Confidence" in histogram_dialog.windowTitle()

    def test_get_threshold_returns_initial(self, histogram_dialog):
        assert histogram_dialog.get_threshold() == 0.9

    def test_info_label_shows_count(self, histogram_dialog):
        assert "10" in histogram_dialog._info_label.text()

    def test_threshold_label_updates(self, histogram_dialog):
        histogram_dialog._on_threshold_changed(0.75)
        assert "0.7500" in histogram_dialog._threshold_label.text()
