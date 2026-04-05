"""Animated ASCII art startup display for the console."""

from __future__ import annotations

import os
import random
import re
import shutil
import sys
import time

# ANSI escape codes
_CLEAR = "\033[2J\033[3J\033[H"
_BOLD = "\033[1m"
_DIM = "\033[2m"
_RESET = "\033[0m"
_CYAN = "\033[36m"
_BRIGHT_CYAN = "\033[96m"
_GREEN = "\033[32m"
_BRIGHT_GREEN = "\033[92m"
_YELLOW = "\033[33m"
_WHITE = "\033[97m"
_GRAY = "\033[90m"

_LOGO = (
    "\u2588\u2588\u2557                              \u2588\u2588\u2557\n"
    "\u2588\u2588\u2551                              \u2588\u2588\u2551\n"
    "\u2588\u2588\u2551      \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2551      \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557\n"
    "\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u255a\u2550\u2550\u2588\u2588\u2588\u2554\u255d\u255a\u2588\u2588\u2557 \u2588\u2588\u2554\u255d\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d\u2588\u2588\u2551\n"
    "\u2588\u2588\u2551     \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551  \u2588\u2588\u2588\u2554\u255d  \u255a\u2588\u2588\u2588\u2588\u2554\u255d \u2588\u2588\u2551     \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551\n"
    "\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551 \u2588\u2588\u2588\u2554\u255d    \u255a\u2588\u2588\u2554\u255d  \u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u255d  \u2588\u2588\u2551\n"
    "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557   \u2588\u2588\u2551   \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\n"
    "\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u255d  \u255a\u2550\u255d\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d   \u255a\u2550\u255d   \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u255d  \u255a\u2550\u255d\u255a\u2550\u2550\u2550\u2550\u2550\u255d \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d"
)

_AUTHOR = "Deniz N. Cakan"
_TAGLINE = "AI-Assisted Image Labeling"
_TOTAL_STEPS = 8

_TIPS = [
    "Tip: Press 1 for AI mode, 2 for polygon, 3 for bounding box.",
    "Tip: Right-click in AI mode to add negative points and exclude regions.",
    "Tip: Hold Shift when completing any segment to erase instead of add. Shift+Space for AI, Shift+Click for polygon, Shift+Release for bbox.",
    "Tip: Press P to auto-convert new AI segments into editable polygons.",
    "Tip: Use Edit mode (R) to drag polygon vertices and fine-tune.",
    "Tip: Press X to quickly toggle most recent class.",
    "Tip: Press Z to toggle the AI filter between 0 and your last set threshold.",
    "Tip: Hold Shift while panning with WASD for a 5x more pan.",
    "Tip: Press . (period) to fit the entire image in view.",
    "Tip: Press M in selection mode to merge multiple segments to the same class.",
    "Tip: Ctrl+A selects all segments: useful for bulk class assignment.",
    "Tip: Press Enter to save/export the current image's annotations.",
    "Tip: Use Ctrl+Z / Ctrl+Y to undo and redo segment operations.",
    "Tip: Enable 'Operate On View' so SAM processes your adjusted image, not the original.",
    "Tip: Enable Pixel Priority to resolve overlapping classes.",
    "Tip: You can export to multiple formats at once — NPZ, YOLO, COCO, VOC, and more.",
    "Tip: Use COCO supercategories by setting class aliases as 'name.supercategory'.",
    "Tip: Drag classes in the class table to reorder them.",
    "Tip: The file manager columns show which annotation files exist per image.",
    "Tip: Both left and right panels can be popped out into separate windows.",
    "Tip: Sequence mode propagates masks across image series using SAM 2.1.",
    "Tip: Press G to add the current frame as a reference for propagation.",
    "Tip: Press N / Shift+N to jump between flagged frames, B / Shift+B between reference frames.",
    "Tip: 'Find Archetypes' identifies diverse frames via clustering — label them, then add as references.",
    "Tip: Streaming mode kicks in for 250+ frame sequences to keep memory bounded.",
    "Tip: Use Border Crop to constrain annotations to a region of interest.",
    "Tip: FFT Threshold helps filter noise in the frequency domain.",
    "Tip: CLAHE in the Rescale widget enhances local contrast adaptively.",
    "Tip: Adjust gamma to reveal detail in dark or overexposed images.",
    "Tip: Click near the first vertex to close a polygon. Join Threshold controls the snap distance.",
    "Tip: Auto-Save is on by default — annotations save when you switch images.",
    "Tip: SAM 1.0 models auto-download on first use (if your network permits). SAM 2.1 requires manual install for sequence mode.",
    "Tip: You can load custom SAM checkpoints from the model dropdown.",
    "Tip: Multi-view mode lets you annotate 2 images side by side.",
    "Tip: Press Q to enter Pan mode for easier navigation on large images.",
    "Tip: Arrow keys navigate between images in the current folder.",
    "Tip: The polygon resolution slider controls how smooth auto-converted polygons are.",
    "Tip: NPZ files store one-hot encoded masks — one binary channel per class.",
    "Tip: NPZ Class Map exports a single-channel label map for semantic segmentation.",
    "Tip: Use the Hotkeys button in the control panel to customize all keyboard shortcuts.",
    "Tip: Each shortcut supports both a primary and secondary key binding.",
    "Tip: Ctrl+Plus / Ctrl+Minus to zoom in and out.",
    "Tip: Selection mode (E) lets you click individual segments to select them.",
    "Tip: Hold Ctrl and click to select multiple segments at once.",
    "Tip: Press V or Backspace to delete selected segments.",
    "Tip: The saturation slider at 0.0 converts the view to grayscale.",
    "Tip: LazyLabel caches SAM embeddings — revisiting an image is much faster.",
    "Tip: Next/previous images are preloaded in the background for instant navigation.",
    "Tip: GPU status is shown in the status bar: If you have PyTorch with CUDA, it accelerates SAM inference.",
]


def _get_version() -> str:
    """Read the version from pyproject.toml at import time."""
    try:
        from importlib.metadata import version

        return version("lazylabel-gui")
    except Exception:
        return "?"


def _is_tty() -> bool:
    """Check if stdout is a real terminal (not devnull / piped / PyInstaller hidden)."""
    try:
        return (
            sys.stdout is not None
            and hasattr(sys.stdout, "isatty")
            and sys.stdout.isatty()
        )
    except Exception:
        return False


class StartupDisplay:
    """Animated console startup display with ASCII art and progress bar."""

    def __init__(self) -> None:
        self._enabled = _is_tty()
        self._width = shutil.get_terminal_size((80, 24)).columns
        self._logo_lines = _LOGO.split("\n")
        self._logo_width = max(len(line) for line in self._logo_lines)
        self._real_stdout: object | None = None
        self._real_stderr: object | None = None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _center(self, text: str) -> str:
        """Center a line of text based on its visible (non-ANSI) length."""
        visible = re.sub(r"\033\[[0-9;]*m", "", text)
        padding = max(0, (self._width - len(visible)) // 2)
        return " " * padding + text

    def _write(self, *parts: str) -> None:
        target = self._real_stdout or sys.stdout
        target.write("".join(parts))
        target.flush()

    def _draw_frame(self, step: int, message: str, *, final: bool = False) -> None:
        """Clear screen and redraw the full display for one frame."""
        lines: list[str] = [_CLEAR, ""]

        # -- Logo (centered as a block using the widest line) --
        logo_color = _BRIGHT_GREEN if final else _BRIGHT_CYAN
        logo_pad = max(0, (self._width - self._logo_width) // 2)
        for logo_line in self._logo_lines:
            padded = logo_line.ljust(self._logo_width)
            lines.append(f"{' ' * logo_pad}{logo_color}{_BOLD}{padded}{_RESET}")

        lines.append("")
        lines.append(self._center(f"{_WHITE}{_BOLD}{_AUTHOR}{_RESET}"))
        ver = _get_version()
        lines.append(self._center(f"{_CYAN}{_TAGLINE}  {_WHITE}v{ver}{_RESET}"))
        lines.append("")
        lines.append("")

        # -- Progress bar --
        bar_width = min(40, self._width - 20)
        filled = int(bar_width * step / _TOTAL_STEPS)
        empty = bar_width - filled

        if final:
            bar = f"{_BRIGHT_GREEN}{'━' * bar_width}{_RESET}"
        else:
            bar = f"{_GREEN}{'━' * filled}{_GRAY}{'─' * empty}{_RESET}"

        pct = int(100 * step / _TOTAL_STEPS)
        lines.append(self._center(f"  {bar}  {_WHITE}{pct:>3}%{_RESET}"))
        lines.append("")

        # -- Status message --
        if final:
            status = f"{_BRIGHT_GREEN}{_BOLD}>>> {message}{_RESET}"
        else:
            dots = "." * ((step % 3) + 1)
            status = f"{_YELLOW}>>> {message}{dots}{_RESET}"
        lines.append(self._center(status))
        lines.append("")

        self._write("\n".join(lines))

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def _capture_output(self) -> None:
        """Redirect stdout, stderr, and all logging StreamHandlers to devnull.

        Animation frames are written directly to the saved real stdout.
        """
        import logging

        self._real_stdout = sys.stdout
        self._real_stderr = sys.stderr
        self._saved_streams: list[tuple[logging.StreamHandler, object]] = []
        devnull = open(os.devnull, "w")  # noqa: SIM115
        sys.stdout = devnull
        sys.stderr = devnull

        # Redirect any StreamHandler that points at the real stderr/stdout
        for lg_name in [None, "lazylabel"]:
            for handler in logging.getLogger(lg_name).handlers:
                if isinstance(handler, logging.StreamHandler) and not isinstance(
                    handler, logging.FileHandler
                ):
                    self._saved_streams.append((handler, handler.stream))
                    handler.stream = devnull

    def _release_output(self) -> None:
        """Restore stdout, stderr, and logging StreamHandler streams."""
        if self._real_stdout is not None:
            devnull = sys.stdout
            sys.stdout = self._real_stdout
            sys.stderr = self._real_stderr
            self._real_stdout = None
            self._real_stderr = None

            for handler, original_stream in self._saved_streams:
                handler.stream = original_stream
            self._saved_streams.clear()

            devnull.close()

    def show_banner(self) -> None:
        """Reveal the ASCII art logo line by line with animation."""
        if not self._enabled:
            return

        self._capture_output()

        # Wipe screen
        self._write(_CLEAR)

        # Reveal logo line-by-line
        logo_pad = max(0, (self._width - self._logo_width) // 2)
        for i in range(len(self._logo_lines)):
            frame: list[str] = [_CLEAR, ""]
            for j in range(i + 1):
                padded = self._logo_lines[j].ljust(self._logo_width)
                frame.append(f"{' ' * logo_pad}{_BRIGHT_CYAN}{_BOLD}{padded}{_RESET}")
            self._write("\n".join(frame))
            time.sleep(0.05)

        time.sleep(0.12)

        # Show full frame at step 0
        self._draw_frame(0, "Starting up")

    def update_step(self, step: int, message: str) -> None:
        """Redraw the display with an updated progress bar and status."""
        if not self._enabled:
            return
        self._draw_frame(step, message)

    def finish(self) -> None:
        """Show the final 'ready' state and hand control back to normal output."""
        if not self._enabled:
            return
        self._draw_frame(
            _TOTAL_STEPS,
            random.choice(_TIPS),
            final=True,  # noqa: S311
        )
        time.sleep(0.25)
        # Move cursor below the display so subsequent output is clean
        self._write("\n\n")
        self._release_output()


# Module-level singleton
startup_display = StartupDisplay()
