import logging
import os


def setup_logging(log_file="lazylabel.log", level=logging.INFO):
    """
    Sets up the logging configuration for the application.

    Args:
        log_file (str): The name of the log file.
        level (int): The logging level (e.g., logging.INFO, logging.DEBUG).
    """
    log_dir = os.path.join(os.path.expanduser("~"), ".lazylabel", "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, log_file)

    # Create a logger
    logger = logging.getLogger("lazylabel")
    logger.setLevel(level)

    # Create handlers
    # Console handler
    c_handler = logging.StreamHandler()
    c_handler.setLevel(level)

    # File handler
    f_handler = logging.FileHandler(log_path)
    f_handler.setLevel(level)

    # Create formatters and add it to handlers
    c_format = logging.Formatter("%(levelname)s: %(message)s")
    f_format = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    c_handler.setFormatter(c_format)
    f_handler.setFormatter(f_format)

    # Add handlers to the logger
    if not logger.handlers:  # Avoid adding handlers multiple times
        logger.addHandler(c_handler)
        logger.addHandler(f_handler)

    return logger


# Initialize logger for the application
logger = setup_logging()
