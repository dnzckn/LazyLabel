"""Whether the AI stack is present and new enough.

RULE-084: AI tools are enabled only when ``segment_anything`` imports and PyTorch is 2.7.1 or
newer. The card also records two defects in how legacy asks that question, and both are the same
mistake -- a check that can itself crash:

    parts = [int(p) for p in torch.__version__.split("+")[0].split(".")[:3]]

A pre-release build reports "2.8.0a0", so ``int("0a0")`` raises ValueError. Legacy catches only
ImportError around this, so a nightly PyTorch does not disable the AI features: it stops the
application from starting. A check for whether a feature is available should never be able to take
the program down with it, and a version newer than the minimum should certainly not.

So the parser here is total. Anything it cannot read becomes an answer -- "unknown version" -- not
an exception, and the caller gets a reason it can show a user.
"""

from __future__ import annotations

import importlib.util
import re
from dataclasses import dataclass
from typing import Any, Final

MIN_TORCH_VERSION = (2, 7, 1)

# What installs the AI stack: one command since DEPLOYABILITY.md R6, which a pip extra was before it.
# Short, because the web shows it after the reason as one line, and its terse guard allows 60.
INSTALL_HINT: Final = "Run npm run ai:setup"

# None is a real answer -- "PyTorch is not installed" -- so it cannot also mean "not supplied, go and
# look". A sentinel keeps the two apart; without it a caller saying "pretend torch is absent" gets
# whatever happens to be installed, which is a test that passes for the wrong reason.
_LOOK_IT_UP: Final[Any] = object()

# 2.7.1, 2.8.0a0, 2.10.0rc1, 2.7.1+cu124, 2.7.1.dev20250101+cpu -- take the leading numeric parts and
# note whether anything follows them.
_VERSION = re.compile(r"^(\d+)(?:\.(\d+))?(?:\.(\d+))?(.*)$")


@dataclass(frozen=True)
class Version:
    major: int
    minor: int
    patch: int
    """True when the string carried a pre-release or dev suffix, e.g. 2.8.0a0 or 2.10.0rc1."""
    prerelease: bool
    raw: str

    def as_tuple(self) -> tuple[int, int, int]:
        return (self.major, self.minor, self.patch)


def parse_version(raw: str) -> Version | None:
    """Parse a PyTorch version string, or return None when it cannot be read.

    Never raises. The local build suffix after "+" is ignored, as legacy ignores it, and only the
    first three parts are compared -- but unlike legacy, a non-numeric third part is a suffix to be
    noted rather than an int() that explodes.
    """
    core = raw.split("+")[0].strip()
    match = _VERSION.match(core)
    if match is None:
        return None

    major, minor, patch, rest = match.groups()
    return Version(
        major=int(major),
        minor=int(minor or 0),
        patch=int(patch or 0),
        prerelease=bool(rest),
        raw=raw,
    )


@dataclass(frozen=True)
class Availability:
    """Whether AI work can run here, and what to tell the user if not."""

    available: bool
    torch_version: str | None
    reason: str
    """True for SAM 2, which propagation needs and SAM 1 cannot do."""
    video_capable: bool = False

    @property
    def install_hint(self) -> str:
        return INSTALL_HINT


def check_availability(
    *, torch_version: str | None | Any = _LOOK_IT_UP, has_sam: bool | Any = _LOOK_IT_UP
) -> Availability:
    """Report whether the AI stack is usable.

    Both arguments are injectable so the answer can be tested for every interesting case without
    installing PyTorch -- including the pre-release strings that crash the legacy check, which
    could not otherwise be tested at all without a nightly build to hand. Passing
    ``torch_version=None`` means "PyTorch is absent"; omitting it means "find out".
    """
    if torch_version is _LOOK_IT_UP:
        torch_version = _installed_torch_version()
    if has_sam is _LOOK_IT_UP:
        has_sam = importlib.util.find_spec("segment_anything") is not None

    if torch_version is None:
        return Availability(False, None, "PyTorch is not installed.")

    version = parse_version(torch_version)
    if version is None:
        # Unreadable, not fatal. Legacy raises here and takes the app with it.
        return Availability(
            False,
            torch_version,
            f"The installed PyTorch reports version {torch_version!r}, which cannot be read. "
            "AI features are disabled rather than run against an unknown build.",
        )

    minimum = ".".join(str(part) for part in MIN_TORCH_VERSION)
    if version.as_tuple() < MIN_TORCH_VERSION:
        return Availability(
            False,
            torch_version,
            f"PyTorch {torch_version} is older than the required {minimum}.",
        )

    if not has_sam:
        return Availability(
            False,
            torch_version,
            "The segment-anything package is not installed.",
        )

    # A pre-release that is new enough is allowed, and SAID to be a pre-release. Silently treating a
    # nightly as a supported build is how an odd failure becomes unexplainable later.
    note = " (a pre-release build)" if version.prerelease else ""
    return Availability(
        True,
        torch_version,
        f"PyTorch {torch_version}{note} and segment-anything are available.",
        video_capable=importlib.util.find_spec("sam2") is not None,
    )


def _installed_torch_version() -> str | None:
    """The installed PyTorch version, or None. Importing torch is slow, so metadata is tried first."""
    try:
        from importlib.metadata import PackageNotFoundError, version

        try:
            return version("torch")
        except PackageNotFoundError:
            return None
    except Exception:  # pragma: no cover - importlib.metadata is stdlib and should not fail
        return None


@dataclass(frozen=True)
class Accelerator:
    """What the model actually runs on.

    A separate question from `Availability`, and deliberately not folded into it: a machine can have
    a GPU and no PyTorch, or PyTorch and no GPU, and collapsing the two would make one unanswerable
    whenever the other fails.

    This matters MORE in a hosted deployment than it did on the desktop, not less. Legacy shows
    "GPU: ..." or "CPU Only" in its status bar, where the user could have guessed it from their own
    machine anyway. Here the model runs on a server the user cannot see, so "why does every click
    take four seconds" has no answer available to them unless the service says so.
    """

    kind: str
    """"cuda", "cpu", or "unknown" when PyTorch is not installed to ask."""
    name: str | None
    """The device's own name, when there is one to report."""

    @property
    def summary(self) -> str:
        if self.kind == "cuda":
            return self.name or "GPU"
        if self.kind == "cpu":
            return "CPU"
        return "unknown"


def describe_accelerator(
    *, cuda: bool | Any = _LOOK_IT_UP, name: str | None | Any = _LOOK_IT_UP
) -> Accelerator:
    """Which device inference would use, reported rather than assumed.

    Injectable for the same reason `check_availability` is: the interesting cases are a CUDA machine
    and a CPU-only one, and a test suite runs on whichever it runs on.

    Importing torch is slow and asking it about CUDA is slower, so this is called from the health
    route rather than on every request. Anything that raises is reported as unknown -- a status bar
    that cannot say which device is in use is a small loss, and one that takes the service down
    trying to find out is a large one.
    """
    if cuda is _LOOK_IT_UP:
        try:
            import torch

            cuda = bool(torch.cuda.is_available())
        except Exception:
            return Accelerator("unknown", None)

    if not cuda:
        return Accelerator("cpu", None)

    if name is _LOOK_IT_UP:
        try:
            import torch

            name = torch.cuda.get_device_name(0)
        except Exception:
            name = None

    return Accelerator("cuda", name)
