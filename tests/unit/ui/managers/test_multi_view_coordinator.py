"""Unit tests for MultiViewCoordinator.

Tests the coordination logic between two viewers in multi-view mode,
including link state management, active viewer tracking, points state,
preview state, and linked operations.
"""

from unittest.mock import Mock

import pytest


@pytest.fixture
def mock_main_window():
    """Create a minimal mock MainWindow for coordinator tests."""
    mw = Mock()
    return mw


@pytest.fixture
def coordinator(app, mock_main_window):
    """Create MultiViewCoordinator with mock main window."""
    from lazylabel.ui.managers.multi_view_coordinator import MultiViewCoordinator

    return MultiViewCoordinator(mock_main_window)


# ========== Link State Tests ==========


class TestMultiViewCoordinatorLinkState:
    """Tests for link state management."""

    def test_initial_state_is_linked(self, coordinator):
        """Test that initial link state is True."""
        assert coordinator.is_linked is True

    def test_toggle_link_from_linked_to_unlinked(self, coordinator):
        """Test toggling link state from True to False."""
        assert coordinator.is_linked is True
        result = coordinator.toggle_link()
        assert result is False
        assert coordinator.is_linked is False

    def test_toggle_link_from_unlinked_to_linked(self, coordinator):
        """Test toggling link state from False to True."""
        coordinator.toggle_link()  # Now unlinked
        assert coordinator.is_linked is False
        result = coordinator.toggle_link()
        assert result is True
        assert coordinator.is_linked is True

    def test_toggle_link_returns_new_state(self, coordinator):
        """Test that toggle_link returns the new link state."""
        # First toggle: linked -> unlinked
        result1 = coordinator.toggle_link()
        assert result1 is False

        # Second toggle: unlinked -> linked
        result2 = coordinator.toggle_link()
        assert result2 is True

    def test_set_linked_true_when_already_linked_no_signal(self, coordinator, qtbot):
        """Test that setting linked=True when already linked doesn't emit signal."""
        assert coordinator.is_linked is True

        with qtbot.assertNotEmitted(coordinator.link_state_changed):
            coordinator.set_linked(True)

        assert coordinator.is_linked is True

    def test_set_linked_false_when_linked_emits_signal(self, coordinator, qtbot):
        """Test that setting linked=False when linked emits signal."""
        assert coordinator.is_linked is True

        with qtbot.waitSignal(coordinator.link_state_changed, timeout=1000) as blocker:
            coordinator.set_linked(False)

        assert blocker.args == [False]
        assert coordinator.is_linked is False

    def test_set_linked_true_when_unlinked_emits_signal(self, coordinator, qtbot):
        """Test that setting linked=True when unlinked emits signal."""
        coordinator.set_linked(False)
        assert coordinator.is_linked is False

        with qtbot.waitSignal(coordinator.link_state_changed, timeout=1000) as blocker:
            coordinator.set_linked(True)

        assert blocker.args == [True]
        assert coordinator.is_linked is True

    def test_link_state_changed_signal_emitted_on_toggle(self, coordinator, qtbot):
        """Test that link_state_changed signal is emitted on toggle."""
        with qtbot.waitSignal(coordinator.link_state_changed, timeout=1000) as blocker:
            coordinator.toggle_link()

        assert blocker.args == [False]


# ========== Active Viewer Tests ==========


class TestMultiViewCoordinatorActiveViewer:
    """Tests for active viewer tracking."""

    def test_initial_active_viewer_is_zero(self, coordinator):
        """Test that initial active viewer is 0."""
        assert coordinator.active_viewer_idx == 0

    def test_set_active_viewer_to_one(self, coordinator):
        """Test setting active viewer to 1."""
        coordinator.set_active_viewer(1)
        assert coordinator.active_viewer_idx == 1

    def test_set_active_viewer_to_zero(self, coordinator):
        """Test setting active viewer back to 0."""
        coordinator.set_active_viewer(1)
        coordinator.set_active_viewer(0)
        assert coordinator.active_viewer_idx == 0

    def test_set_active_viewer_invalid_negative_ignored(self, coordinator):
        """Test that invalid negative index is ignored."""
        coordinator.set_active_viewer(-1)
        assert coordinator.active_viewer_idx == 0

    def test_set_active_viewer_invalid_too_high_ignored(self, coordinator):
        """Test that invalid index > 1 is ignored."""
        coordinator.set_active_viewer(2)
        assert coordinator.active_viewer_idx == 0

    def test_set_active_viewer_same_value_no_signal(self, coordinator, qtbot):
        """Test that setting same active viewer doesn't emit signal."""
        assert coordinator.active_viewer_idx == 0

        with qtbot.assertNotEmitted(coordinator.active_viewer_changed):
            coordinator.set_active_viewer(0)

    def test_active_viewer_changed_signal_emitted(self, coordinator, qtbot):
        """Test that active_viewer_changed signal is emitted on change."""
        with qtbot.waitSignal(
            coordinator.active_viewer_changed, timeout=1000
        ) as blocker:
            coordinator.set_active_viewer(1)

        assert blocker.args == [1]

    def test_get_other_viewer_idx_when_active_is_zero(self, coordinator):
        """Test get_other_viewer_idx returns 1 when active is 0."""
        coordinator.set_active_viewer(0)
        assert coordinator.get_other_viewer_idx() == 1

    def test_get_other_viewer_idx_when_active_is_one(self, coordinator):
        """Test get_other_viewer_idx returns 0 when active is 1."""
        coordinator.set_active_viewer(1)
        assert coordinator.get_other_viewer_idx() == 0


# ========== Points State Tests ==========


class TestMultiViewCoordinatorPointsState:
    """Tests for per-viewer points state management."""

    def test_get_positive_points_initially_empty(self, coordinator):
        """Test that positive points are empty initially."""
        assert coordinator.get_positive_points(0) == []
        assert coordinator.get_positive_points(1) == []

    def test_get_negative_points_initially_empty(self, coordinator):
        """Test that negative points are empty initially."""
        assert coordinator.get_negative_points(0) == []
        assert coordinator.get_negative_points(1) == []

    def test_add_positive_point_to_viewer_zero(self, coordinator):
        """Test adding a positive point to viewer 0."""
        coordinator.add_point(0, [100, 200], positive=True)
        assert coordinator.get_positive_points(0) == [[100, 200]]
        assert coordinator.get_positive_points(1) == []

    def test_add_positive_point_to_viewer_one(self, coordinator):
        """Test adding a positive point to viewer 1."""
        coordinator.add_point(1, [150, 250], positive=True)
        assert coordinator.get_positive_points(0) == []
        assert coordinator.get_positive_points(1) == [[150, 250]]

    def test_add_negative_point(self, coordinator):
        """Test adding a negative point."""
        coordinator.add_point(0, [50, 75], positive=False)
        assert coordinator.get_negative_points(0) == [[50, 75]]
        assert coordinator.get_positive_points(0) == []

    def test_add_multiple_points(self, coordinator):
        """Test adding multiple points to same viewer."""
        coordinator.add_point(0, [10, 20], positive=True)
        coordinator.add_point(0, [30, 40], positive=True)
        coordinator.add_point(0, [50, 60], positive=False)
        assert coordinator.get_positive_points(0) == [[10, 20], [30, 40]]
        assert coordinator.get_negative_points(0) == [[50, 60]]

    def test_add_point_invalid_viewer_index_ignored(self, coordinator):
        """Test that invalid viewer index is ignored when adding points."""
        coordinator.add_point(2, [100, 200], positive=True)
        coordinator.add_point(-1, [100, 200], positive=True)
        assert coordinator.get_positive_points(0) == []
        assert coordinator.get_positive_points(1) == []

    def test_clear_points_clears_both_positive_and_negative(self, coordinator):
        """Test that clear_points clears both positive and negative."""
        coordinator.add_point(0, [10, 20], positive=True)
        coordinator.add_point(0, [30, 40], positive=False)
        coordinator.clear_points(0)
        assert coordinator.get_positive_points(0) == []
        assert coordinator.get_negative_points(0) == []

    def test_clear_points_only_affects_specified_viewer(self, coordinator):
        """Test that clear_points only affects the specified viewer."""
        coordinator.add_point(0, [10, 20], positive=True)
        coordinator.add_point(1, [30, 40], positive=True)
        coordinator.clear_points(0)
        assert coordinator.get_positive_points(0) == []
        assert coordinator.get_positive_points(1) == [[30, 40]]

    def test_clear_points_invalid_viewer_index_ignored(self, coordinator):
        """Test that invalid viewer index is ignored when clearing points."""
        coordinator.add_point(0, [10, 20], positive=True)
        coordinator.clear_points(2)
        assert coordinator.get_positive_points(0) == [[10, 20]]

    def test_clear_all_points_clears_both_viewers(self, coordinator):
        """Test that clear_all_points clears all points for all viewers."""
        coordinator.add_point(0, [10, 20], positive=True)
        coordinator.add_point(0, [30, 40], positive=False)
        coordinator.add_point(1, [50, 60], positive=True)
        coordinator.add_point(1, [70, 80], positive=False)
        coordinator.clear_all_points()
        assert coordinator.get_positive_points(0) == []
        assert coordinator.get_negative_points(0) == []
        assert coordinator.get_positive_points(1) == []
        assert coordinator.get_negative_points(1) == []

    def test_get_positive_points_invalid_index_returns_empty(self, coordinator):
        """Test that invalid index returns empty list."""
        assert coordinator.get_positive_points(2) == []
        assert coordinator.get_positive_points(-1) == []

    def test_get_negative_points_invalid_index_returns_empty(self, coordinator):
        """Test that invalid index returns empty list."""
        assert coordinator.get_negative_points(2) == []
        assert coordinator.get_negative_points(-1) == []


# ========== Preview State Tests ==========


class TestMultiViewCoordinatorPreviewState:
    """Tests for preview mask and item state."""

    def test_get_preview_mask_returns_none_initially(self, coordinator):
        """Test that preview mask is None initially."""
        assert coordinator.get_preview_mask(0) is None
        assert coordinator.get_preview_mask(1) is None

    def test_set_preview_mask_viewer_zero(self, coordinator):
        """Test setting preview mask for viewer 0."""
        mock_mask = Mock()
        coordinator.set_preview_mask(0, mock_mask)
        assert coordinator.get_preview_mask(0) is mock_mask
        assert coordinator.get_preview_mask(1) is None

    def test_set_preview_mask_viewer_one(self, coordinator):
        """Test setting preview mask for viewer 1."""
        mock_mask = Mock()
        coordinator.set_preview_mask(1, mock_mask)
        assert coordinator.get_preview_mask(0) is None
        assert coordinator.get_preview_mask(1) is mock_mask

    def test_set_preview_mask_invalid_index_ignored(self, coordinator):
        """Test that invalid index is ignored when setting preview mask."""
        mock_mask = Mock()
        coordinator.set_preview_mask(2, mock_mask)
        assert coordinator.get_preview_mask(0) is None
        assert coordinator.get_preview_mask(1) is None

    def test_set_preview_mask_to_none(self, coordinator):
        """Test setting preview mask to None."""
        mock_mask = Mock()
        coordinator.set_preview_mask(0, mock_mask)
        coordinator.set_preview_mask(0, None)
        assert coordinator.get_preview_mask(0) is None

    def test_get_preview_item_returns_none_initially(self, coordinator):
        """Test that preview item is None initially."""
        assert coordinator.get_preview_item(0) is None
        assert coordinator.get_preview_item(1) is None

    def test_set_preview_item(self, coordinator):
        """Test setting preview item."""
        mock_item = Mock()
        coordinator.set_preview_item(0, mock_item)
        assert coordinator.get_preview_item(0) is mock_item

    def test_set_preview_item_invalid_index_ignored(self, coordinator):
        """Test that invalid index is ignored when setting preview item."""
        mock_item = Mock()
        coordinator.set_preview_item(2, mock_item)
        assert coordinator.get_preview_item(0) is None
        assert coordinator.get_preview_item(1) is None

    def test_get_point_items_returns_empty_initially(self, coordinator):
        """Test that point items are empty initially."""
        assert coordinator.get_point_items(0) == []
        assert coordinator.get_point_items(1) == []

    def test_add_point_item(self, coordinator):
        """Test adding a point item."""
        mock_item = Mock()
        coordinator.add_point_item(0, mock_item)
        assert coordinator.get_point_items(0) == [mock_item]

    def test_add_multiple_point_items(self, coordinator):
        """Test adding multiple point items."""
        mock_item1 = Mock()
        mock_item2 = Mock()
        coordinator.add_point_item(0, mock_item1)
        coordinator.add_point_item(0, mock_item2)
        assert coordinator.get_point_items(0) == [mock_item1, mock_item2]

    def test_add_point_item_invalid_index_ignored(self, coordinator):
        """Test that invalid index is ignored when adding point item."""
        mock_item = Mock()
        coordinator.add_point_item(2, mock_item)
        assert coordinator.get_point_items(0) == []
        assert coordinator.get_point_items(1) == []

    def test_clear_point_items(self, coordinator):
        """Test clearing point items."""
        mock_item1 = Mock()
        mock_item2 = Mock()
        coordinator.add_point_item(0, mock_item1)
        coordinator.add_point_item(0, mock_item2)
        coordinator.clear_point_items(0)
        assert coordinator.get_point_items(0) == []

    def test_clear_point_items_only_affects_specified_viewer(self, coordinator):
        """Test that clear_point_items only affects specified viewer."""
        mock_item1 = Mock()
        mock_item2 = Mock()
        coordinator.add_point_item(0, mock_item1)
        coordinator.add_point_item(1, mock_item2)
        coordinator.clear_point_items(0)
        assert coordinator.get_point_items(0) == []
        assert coordinator.get_point_items(1) == [mock_item2]

    def test_clear_point_items_invalid_index_ignored(self, coordinator):
        """Test that invalid index is ignored when clearing point items."""
        mock_item = Mock()
        coordinator.add_point_item(0, mock_item)
        coordinator.clear_point_items(2)
        assert coordinator.get_point_items(0) == [mock_item]

    def test_clear_all_preview_state(self, coordinator):
        """Test that clear_all_preview_state clears everything."""
        # Set up state for both viewers
        coordinator.set_preview_mask(0, Mock())
        coordinator.set_preview_mask(1, Mock())
        coordinator.set_preview_item(0, Mock())
        coordinator.set_preview_item(1, Mock())
        coordinator.add_point_item(0, Mock())
        coordinator.add_point_item(1, Mock())
        coordinator.add_point(0, [10, 20], positive=True)
        coordinator.add_point(1, [30, 40], positive=False)

        coordinator.clear_all_preview_state()

        assert coordinator.get_preview_mask(0) is None
        assert coordinator.get_preview_mask(1) is None
        assert coordinator.get_preview_item(0) is None
        assert coordinator.get_preview_item(1) is None
        assert coordinator.get_point_items(0) == []
        assert coordinator.get_point_items(1) == []
        assert coordinator.get_positive_points(0) == []
        assert coordinator.get_positive_points(1) == []
        assert coordinator.get_negative_points(0) == []
        assert coordinator.get_negative_points(1) == []


# ========== Linked Operations Tests ==========


class TestMultiViewCoordinatorLinkedOperations:
    """Tests for target viewer selection based on link state."""

    def test_get_target_viewers_when_linked_returns_both(self, coordinator):
        """Test get_target_viewers returns [0, 1] when linked."""
        assert coordinator.is_linked is True
        assert coordinator.get_target_viewers() == [0, 1]

    def test_get_target_viewers_when_unlinked_returns_active_only(self, coordinator):
        """Test get_target_viewers returns only active viewer when unlinked."""
        coordinator.set_linked(False)
        coordinator.set_active_viewer(0)
        assert coordinator.get_target_viewers() == [0]

    def test_get_target_viewers_unlinked_active_viewer_one(self, coordinator):
        """Test get_target_viewers returns [1] when unlinked and viewer 1 active."""
        coordinator.set_linked(False)
        coordinator.set_active_viewer(1)
        assert coordinator.get_target_viewers() == [1]

    def test_should_mirror_operation_when_linked(self, coordinator):
        """Test should_mirror_operation returns True when linked."""
        assert coordinator.is_linked is True
        assert coordinator.should_mirror_operation() is True

    def test_should_mirror_operation_when_unlinked(self, coordinator):
        """Test should_mirror_operation returns False when unlinked."""
        coordinator.set_linked(False)
        assert coordinator.should_mirror_operation() is False

    def test_target_viewers_changes_with_link_state(self, coordinator):
        """Test that target viewers change when link state changes."""
        # Initially linked
        assert coordinator.get_target_viewers() == [0, 1]

        # Unlink
        coordinator.set_linked(False)
        assert coordinator.get_target_viewers() == [0]

        # Link again
        coordinator.set_linked(True)
        assert coordinator.get_target_viewers() == [0, 1]

    def test_target_viewers_changes_with_active_viewer_when_unlinked(self, coordinator):
        """Test that target viewers change with active viewer when unlinked."""
        coordinator.set_linked(False)

        coordinator.set_active_viewer(0)
        assert coordinator.get_target_viewers() == [0]

        coordinator.set_active_viewer(1)
        assert coordinator.get_target_viewers() == [1]

    def test_active_viewer_irrelevant_when_linked(self, coordinator):
        """Test that active viewer doesn't affect target when linked."""
        assert coordinator.is_linked is True

        coordinator.set_active_viewer(0)
        assert coordinator.get_target_viewers() == [0, 1]

        coordinator.set_active_viewer(1)
        assert coordinator.get_target_viewers() == [0, 1]
