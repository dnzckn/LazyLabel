#!/usr/bin/env python3
"""
Test script to check hover functionality.
Run this before starting LazyLabel to enable debug logging.
"""

# First, enable debug logging
import logging
import os
import sys

# Add the src directory to path so we can import LazyLabel modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from lazylabel.utils.logger import logger

# Set logger to DEBUG level
logger.setLevel(logging.DEBUG)

# Add console handler if not already present
if not logger.handlers:
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

print("=" * 50)
print("HOVER DEBUG MODE ENABLED")
print("=" * 50)
print("Logger level:", logger.level)
print("Logger handlers:", len(logger.handlers))
print()
print("Now run LazyLabel and test hover functionality:")
print("1. Load images in multi-view mode")
print("2. Create some segments (AI or polygon)")
print("3. Try hovering over segments")
print("4. Watch the console for debug messages")
print()
print("Expected debug messages:")
print("- HoverablePolygonItem.set_segment_info")
print("- HoverablePixmapItem.set_segment_info")
print("- HoverablePolygonItem.hoverEnterEvent")
print("- HoverablePixmapItem.hoverEnterEvent")
print("- _trigger_segment_hover called")
print("=" * 50)
