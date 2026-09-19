"""Prompt validation, and the errors that replace legacy's return-None-and-log.

Phase 3 exit criterion 4: failures surface as typed errors, never as success. `Sam2Model.predict`
returns None for an exception, for an empty point list, and for a model that is not loaded, so a
caller cannot tell a crash from a request that was never valid.
"""

from __future__ import annotations

import pytest

from lazylabel_inference.prompts import (
    Box,
    InvalidPromptError,
    Point,
    Prompt,
)


class TestValidation:
    def test_accepts_a_single_positive_point(self) -> None:
        Prompt(points=(Point(10, 20),)).validate(100, 200)

    def test_accepts_a_box(self) -> None:
        Prompt(box=Box(10, 10, 50, 50)).validate(100, 200)

    def test_accepts_points_and_a_box_together(self) -> None:
        Prompt(points=(Point(20, 20),), box=Box(10, 10, 50, 50)).validate(100, 200)

    def test_refuses_an_empty_prompt(self) -> None:
        # Legacy returns None here, which the caller reads as a failed prediction. It is not a
        # failure; it is a request that was never valid, and the difference decides whether a
        # client can fix it or retries forever.
        with pytest.raises(InvalidPromptError, match="at least one point or a box"):
            Prompt().validate(100, 200)

    def test_refuses_only_negative_points(self) -> None:
        # Negative points describe what the object is not. There is nothing to grow from.
        with pytest.raises(InvalidPromptError, match="nothing to segment"):
            Prompt(points=(Point(10, 10, positive=False),)).validate(100, 200)

    @pytest.mark.parametrize(
        "point", [Point(-1, 10), Point(10, -1), Point(200, 10), Point(10, 100), Point(1e9, 1e9)]
    )
    def test_refuses_a_point_outside_the_image(self, point: Point) -> None:
        # Height 100, width 200, so x is valid in [0, 200) and y in [0, 100).
        with pytest.raises(InvalidPromptError, match="outside"):
            Prompt(points=(point,)).validate(100, 200)

    def test_accepts_a_point_on_the_last_valid_pixel(self) -> None:
        Prompt(points=(Point(199, 99),)).validate(100, 200)

    def test_refuses_a_box_outside_the_image(self) -> None:
        with pytest.raises(InvalidPromptError, match="outside"):
            Prompt(box=Box(10, 10, 500, 50)).validate(100, 200)

    def test_refuses_a_box_with_no_area(self) -> None:
        with pytest.raises(InvalidPromptError, match="no area"):
            Prompt(box=Box(10, 10, 10, 50)).validate(100, 200)


class TestBoxNormalization:
    def test_orders_the_corners_whichever_way_the_user_dragged(self) -> None:
        dragged_up_left = Box(50, 60, 10, 20).normalized()
        assert (dragged_up_left.x1, dragged_up_left.y1) == (10, 20)
        assert (dragged_up_left.x2, dragged_up_left.y2) == (50, 60)

    def test_leaves_an_already_ordered_box_alone(self) -> None:
        assert Box(10, 20, 50, 60).normalized() == Box(10, 20, 50, 60)

    def test_a_backwards_box_validates_once_normalized(self) -> None:
        # A user dragging from bottom-right to top-left is drawing a perfectly good box.
        Prompt(box=Box(50, 60, 10, 20)).validate(100, 200)
