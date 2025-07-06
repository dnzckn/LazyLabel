#!/usr/bin/env python3
"""Debug script to test hover functionality in LazyLabel."""

import logging
import os
import sys

# Add the src directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# Set up debug logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

# Enable debug logging for the specific modules we're interested in
logger = logging.getLogger()
logger.setLevel(logging.DEBUG)

# Set specific loggers to debug level
logging.getLogger('lazylabel.ui.main_window').setLevel(logging.DEBUG)
logging.getLogger('lazylabel.ui.modes.multi_view_mode').setLevel(logging.DEBUG)
logging.getLogger('lazylabel.ui.hoverable_polygon_item').setLevel(logging.DEBUG)
logging.getLogger('lazylabel.ui.hoverable_pixelmap_item').setLevel(logging.DEBUG)

print("Debug logging enabled. Run LazyLabel and try hovering over segments in multi-view mode.")
print("Watch the console output for debug messages.")
print("Look for messages like:")
print("  - HoverablePolygonItem.hoverEnterEvent")
print("  - HoverablePixmapItem.hoverEnterEvent")
print("  - _trigger_segment_hover called")
print("  - Created HoverablePolygonItem/HoverablePixmapItem")
print("")
print("To run LazyLabel with debug logging, use:")
print("python debug_hover.py && python -m lazylabel.main")
