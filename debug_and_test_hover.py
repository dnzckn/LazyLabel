#!/usr/bin/env python3
"""
Debug script that enables hover debugging and runs LazyLabel.
"""

import logging
import os
import sys

# Add the src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# Set up debug logging before importing LazyLabel
from lazylabel.utils.logger import logger

logger.setLevel(logging.DEBUG)

# Add console handler
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.DEBUG)
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

print("=" * 60)
print("HOVER DEBUG MODE ENABLED")
print("Debug logging level:", logger.level)
print("Number of handlers:", len(logger.handlers))
print("=" * 60)
print()
print("Now test hover functionality:")
print("1. Load images in multi-view mode")
print("2. Create some segments (AI or polygon)")
print("3. Try hovering over segments")
print("4. Watch the console for debug messages")
print()
print("Expected debug messages when hovering:")
print("- DEBUG - HoverablePolygonItem.set_segment_info")
print("- DEBUG - HoverablePixmapItem.set_segment_info")
print("- DEBUG - HoverablePolygonItem.hoverEnterEvent")
print("- DEBUG - HoverablePixmapItem.hoverEnterEvent")
print("- DEBUG - _trigger_segment_hover called")
print("=" * 60)

# Now run LazyLabel
if __name__ == "__main__":
    from lazylabel.main import main
    main()
