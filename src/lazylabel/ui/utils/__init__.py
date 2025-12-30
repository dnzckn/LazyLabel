"""UI utility modules for LazyLabel."""

from .scene_utils import (
    clear_items_and_list,
    clear_scene_items,
    clear_scene_items_by_type,
    ensure_item_in_scene,
    safe_remove_from_scene,
    safe_remove_item,
)
from .worker_utils import (
    WorkerCleanupContext,
    cleanup_worker_and_thread,
    cleanup_worker_thread,
    cleanup_worker_thread_strict,
    delete_worker_later,
    stop_worker,
)

__all__ = [
    # Scene utilities
    "safe_remove_item",
    "safe_remove_from_scene",
    "clear_scene_items",
    "clear_scene_items_by_type",
    "clear_items_and_list",
    "ensure_item_in_scene",
    # Worker utilities
    "stop_worker",
    "cleanup_worker_thread",
    "cleanup_worker_thread_strict",
    "delete_worker_later",
    "cleanup_worker_and_thread",
    "WorkerCleanupContext",
]
