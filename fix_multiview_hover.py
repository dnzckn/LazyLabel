#!/usr/bin/env python3
"""Script to add debug code and fix multi-view hover issues."""

import re


def add_mouse_tracking():
    """Add mouse tracking to photo viewers for better hover detection."""

    photo_viewer_path = "src/lazylabel/ui/photo_viewer.py"

    # Read the file
    with open(photo_viewer_path) as f:
        content = f.read()

    # Add mouse tracking in __init__
    init_pattern = r"(self\.setDragMode\(QGraphicsView\.DragMode\.NoDrag\))"
    replacement = r"\1\n        self.setMouseTracking(True)  # Enable mouse tracking for hover events"

    new_content = re.sub(init_pattern, replacement, content)

    # Write back
    with open(photo_viewer_path, "w") as f:
        f.write(new_content)

    print(f"Added mouse tracking to {photo_viewer_path}")


def add_debug_to_display():
    """Add debug logging to segment display."""

    main_window_path = "src/lazylabel/ui/main_window.py"

    # Read the file
    with open(main_window_path) as f:
        content = f.read()

    # Add debug after creating hoverable items
    pattern1 = r"(poly_item\.set_segment_info\(segment_index, self\))"
    replacement1 = r'\1\n            logger.debug(f"Set segment info for polygon {segment_index} in viewer {viewer_index}")'

    pattern2 = r"(pixmap_item\.set_segment_info\(segment_index, self\))"
    replacement2 = r'\1\n            logger.debug(f"Set segment info for pixmap {segment_index} in viewer {viewer_index}")'

    new_content = re.sub(pattern1, replacement1, content)
    new_content = re.sub(pattern2, replacement2, new_content)

    # Write back
    with open(main_window_path, "w") as f:
        f.write(new_content)

    print(f"Added debug logging to {main_window_path}")


if __name__ == "__main__":
    print("Fixing multi-view hover issues...")
    add_mouse_tracking()
    add_debug_to_display()
    print("Done!")
