"""What a prompt is, what comes back, and what goes wrong.

Everything here is a value. The service's interface speaks masks and scores, never LazyLabel class
ids or file formats - that boundary is what keeps annotation semantics out of the model layer
(`REIMAGINED_ARCHITECTURE.md` section 2).

The errors are the point of the module as much as the types are. Phase 3 exit criterion 4 requires
that failures surface as typed errors and never as success, and the legacy wrappers do the
opposite: `Sam2Model.predict` catches every exception, logs it, and returns None, which the caller
cannot tell from "no positive points were given". `ASSESSMENT.md` 5.4 records the pattern. A mask
that was never computed must not be indistinguishable from an empty one.
"""

from __future__ import annotations

from dataclasses import dataclass, field


class InferenceError(Exception):
    """Base for every failure this service reports. Never swallowed into a None."""


class ModelNotLoadedError(InferenceError):
    """A prompt arrived before any model was loaded."""


class ImageNotSetError(InferenceError):
    """A prompt arrived before an image was encoded."""


class InvalidPromptError(InferenceError):
    """The prompt cannot be acted on: no points, or coordinates outside the image."""


class PredictionFailedError(InferenceError):
    """The model ran and raised. Carries the cause rather than replacing it with None."""


@dataclass(frozen=True)
class Point:
    """One click, in pixel coordinates of the FULL image."""

    x: float
    y: float
    """True for a point the object should include, false for one it should exclude."""
    positive: bool = True


@dataclass(frozen=True)
class Box:
    """A drag, in pixel coordinates of the full image, as [x1, y1, x2, y2]."""

    x1: float
    y1: float
    x2: float
    y2: float

    def normalized(self) -> "Box":
        """The same box with corners ordered, since a user can drag in any direction."""
        return Box(min(self.x1, self.x2), min(self.y1, self.y2), max(self.x1, self.x2), max(self.y1, self.y2))


@dataclass(frozen=True)
class Prompt:
    """Points, a box, or both. At least one must be present."""

    points: tuple[Point, ...] = ()
    box: Box | None = None

    def validate(self, height: int, width: int) -> None:
        """Refuse a prompt that cannot produce a meaningful mask.

        Legacy returns None when `positive_points` is empty, which the caller reads as a failed
        prediction. It is not a failure, it is a request that was never valid, and saying so is the
        difference between a client that can fix it and one that retries forever.
        """
        if not self.points and self.box is None:
            raise InvalidPromptError("a prompt needs at least one point or a box")

        if self.points and not any(point.positive for point in self.points):
            # Negative points alone describe what the object is not. SAM has nothing to grow from.
            raise InvalidPromptError("a prompt of only negative points has nothing to segment")

        for point in self.points:
            if not (0 <= point.x < width and 0 <= point.y < height):
                raise InvalidPromptError(
                    f"the point ({point.x}, {point.y}) is outside the {width}x{height} image"
                )

        if self.box is not None:
            box = self.box.normalized()
            if not (0 <= box.x1 and 0 <= box.y1 and box.x2 <= width and box.y2 <= height):
                raise InvalidPromptError(
                    f"the box {(box.x1, box.y1, box.x2, box.y2)} is outside the {width}x{height} image"
                )
            if box.x2 <= box.x1 or box.y2 <= box.y1:
                raise InvalidPromptError("the box has no area")


@dataclass(frozen=True)
class Prediction:
    """The chosen mask and how the choice was made.

    RULE-020: the model returns three candidate masks and the one with the highest score wins.
    `alternatives` carries the scores of all three so a client can show that the choice was close,
    which legacy discards.
    """

    """Boolean mask over the full image, row-major, as a list of row-major bytes."""
    mask: object  # numpy.ndarray - typed loosely so this module imports without numpy
    score: float
    """Index of the chosen mask among the candidates, and every candidate's score."""
    chosen: int = 0
    alternatives: tuple[float, ...] = field(default_factory=tuple)
