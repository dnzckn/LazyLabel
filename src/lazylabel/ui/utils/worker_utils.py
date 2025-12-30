"""Worker thread utilities for safe cleanup and management.

This module provides utility functions for safely cleaning up QThread
workers, handling timeouts and graceful termination.

Usage:
    from lazylabel.ui.utils import cleanup_worker_thread, stop_worker

    # Stop and clean up a worker thread
    success = cleanup_worker_thread(thread, timeout=1000)

    # Just stop a worker (if it has a stop method)
    stop_worker(worker)
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from ...core.exceptions import WorkerTimeoutError
from ...utils.logger import logger

if TYPE_CHECKING:
    from PyQt6.QtCore import QThread


def stop_worker(worker: Any) -> bool:
    """Stop a worker that has a stop() method.

    Args:
        worker: Worker object with optional stop() method

    Returns:
        True if stop was called, False if worker has no stop method
    """
    if worker is None:
        return False

    if hasattr(worker, "stop") and callable(worker.stop):
        try:
            worker.stop()
            return True
        except Exception as e:
            logger.warning(f"Error stopping worker: {e}")
            return False

    return False


def cleanup_worker_thread(
    thread: QThread | None,
    timeout_ms: int = 1000,
    force_terminate: bool = True,
) -> bool:
    """Safely clean up a QThread worker.

    This function attempts to gracefully quit the thread, waiting for
    the specified timeout. If the thread is still running after the
    timeout and force_terminate is True, it will be terminated.

    Args:
        thread: The QThread to clean up (can be None)
        timeout_ms: Timeout in milliseconds to wait for quit
        force_terminate: If True, terminate thread if it doesn't quit

    Returns:
        True if the thread was successfully cleaned up, False otherwise
    """
    if thread is None:
        return True

    try:
        if not thread.isRunning():
            # Thread not running, just clean up
            thread.deleteLater()
            return True

        # Request graceful quit
        thread.quit()

        # Wait for thread to finish
        if thread.wait(timeout_ms):
            thread.deleteLater()
            return True

        # Thread still running after timeout
        if force_terminate:
            logger.warning(f"Thread did not quit within {timeout_ms}ms, terminating")
            thread.terminate()

            # Wait a bit more after terminate
            if thread.wait(timeout_ms // 2):
                thread.deleteLater()
                return True

            # Final attempt - force quit
            thread.quit()
            thread.wait(timeout_ms // 2)

        thread.deleteLater()
        return not thread.isRunning()

    except Exception as e:
        logger.error(f"Error cleaning up worker thread: {e}")
        return False


def cleanup_worker_thread_strict(
    thread: QThread | None,
    timeout_ms: int = 1000,
    name: str = "worker",
) -> None:
    """Clean up a worker thread, raising on timeout.

    Args:
        thread: The QThread to clean up
        timeout_ms: Timeout in milliseconds
        name: Name for error messages

    Raises:
        WorkerTimeoutError: If thread doesn't stop within timeout
    """
    if thread is None:
        return

    if not cleanup_worker_thread(thread, timeout_ms, force_terminate=True):
        raise WorkerTimeoutError(name, timeout_ms)


def delete_worker_later(worker: Any) -> None:
    """Schedule a worker for deletion.

    Args:
        worker: Worker object with deleteLater() method
    """
    if worker is None:
        return

    if hasattr(worker, "deleteLater") and callable(worker.deleteLater):
        try:
            worker.deleteLater()
        except Exception as e:
            logger.warning(f"Error scheduling worker deletion: {e}")


def cleanup_worker_and_thread(
    worker: Any,
    thread: QThread | None = None,
    timeout_ms: int = 1000,
) -> bool:
    """Clean up both a worker and its thread.

    This is a convenience function for the common pattern of:
    1. Stop the worker
    2. Clean up the thread
    3. Delete the worker

    Args:
        worker: Worker object (may have stop() and deleteLater())
        thread: Optional thread the worker runs on
        timeout_ms: Timeout for thread cleanup

    Returns:
        True if cleanup was successful
    """
    success = True

    # Stop the worker first
    stop_worker(worker)

    # Clean up the thread
    if thread is not None and not cleanup_worker_thread(thread, timeout_ms):
        success = False

    # Delete the worker
    delete_worker_later(worker)

    return success


class WorkerCleanupContext:
    """Context manager for worker cleanup.

    Usage:
        with WorkerCleanupContext(worker, thread) as ctx:
            # Do work...
        # Worker and thread are automatically cleaned up
    """

    def __init__(
        self,
        worker: Any,
        thread: QThread | None = None,
        timeout_ms: int = 1000,
    ):
        self.worker = worker
        self.thread = thread
        self.timeout_ms = timeout_ms
        self._cleanup_on_exit = True

    def __enter__(self) -> WorkerCleanupContext:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if self._cleanup_on_exit:
            cleanup_worker_and_thread(
                self.worker,
                self.thread,
                self.timeout_ms,
            )

    def detach(self) -> None:
        """Prevent automatic cleanup on context exit."""
        self._cleanup_on_exit = False
