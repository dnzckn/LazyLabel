import logging
import os
import sys

# ANSI codes matching the startup banner palette
_RESET = "\033[0m"
_BOLD = "\033[1m"
_DIM = "\033[2m"
_CYAN = "\033[36m"
_BRIGHT_CYAN = "\033[96m"
_GREEN = "\033[32m"
_BRIGHT_GREEN = "\033[92m"
_YELLOW = "\033[33m"
_RED = "\033[31m"
_BRIGHT_RED = "\033[91m"
_WHITE = "\033[97m"
_GRAY = "\033[90m"

_LEVEL_STYLES = {
    logging.DEBUG: (_GRAY, "DBG"),
    logging.INFO: (_CYAN, "INF"),
    logging.WARNING: (_YELLOW, "WRN"),
    logging.ERROR: (_RED, "ERR"),
    logging.CRITICAL: (_BRIGHT_RED, "CRT"),
}


class _StyledFormatter(logging.Formatter):
    """Console formatter with ANSI colors matching the LazyLabel banner."""

    def format(self, record):
        color, tag = _LEVEL_STYLES.get(record.levelno, (_WHITE, "???"))
        # Extract short logger name (last segment after 'lazylabel.')
        name = record.name
        if name.startswith("lazylabel."):
            name = name.split(".")[-1]
        msg = record.getMessage()
        return f"  {color}{_BOLD}{tag}{_RESET} {_GRAY}│{_RESET} {_WHITE}{name}:{_RESET} {msg}"


def setup_logging(log_file="lazylabel.log", level=logging.INFO):
    """Sets up the logging configuration for the application."""
    log_dir = os.path.join(os.path.expanduser("~"), ".lazylabel", "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, log_file)

    logger = logging.getLogger("lazylabel")
    logger.setLevel(level)

    # Console handler with styled output (only if real terminal)
    c_handler = logging.StreamHandler()
    c_handler.setLevel(level)
    if hasattr(sys.stderr, "isatty") and sys.stderr.isatty():
        c_handler.setFormatter(_StyledFormatter())
    else:
        c_handler.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))

    # File handler (plain text, no ANSI)
    f_handler = logging.FileHandler(log_path)
    f_handler.setLevel(level)
    f_handler.setFormatter(
        logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    )

    if not logger.handlers:
        logger.addHandler(c_handler)
        logger.addHandler(f_handler)

    return logger


# Initialize logger for the application
logger = setup_logging()
