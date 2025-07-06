"""Debug script to enable debug logging for hover functionality."""

import logging

from lazylabel.utils.logger import logger

# Set logger to DEBUG level
logger.setLevel(logging.DEBUG)

# Add console handler if not already present
if not logger.handlers:
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter('%(levelname)s:%(name)s:%(message)s')
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

print("Debug logging enabled for hover functionality")
print("Logger level:", logger.level)
print("Logger handlers:", logger.handlers)
