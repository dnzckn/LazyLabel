"""Scene manipulation utilities for safe item removal.

This module provides utility functions for safely removing items from
QGraphicsScene, handling the common RuntimeError that can occur when
items are already removed or the scene is in an inconsistent state.

Usage:
    from lazylabel.ui.utils import safe_remove_item, clear_scene_items

    # Remove single item safely
    if safe_remove_item(item):
        print("Item removed")

    # Clear multiple items
    removed_count = clear_scene_items(items)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from ...core.exceptions import SceneError
from ...utils.logger import logger

if TYPE_CHECKING:
    from collections.abc import Iterable

    from PyQt6.QtWidgets import QGraphicsItem, QGraphicsScene


def safe_remove_item(item: QGraphicsItem | None) -> bool:
    """Safely remove a single item from its scene.

    This function checks if the item is valid and belongs to a scene
    before attempting removal, and catches RuntimeError if the item
    is already removed.

    Args:
        item: The graphics item to remove (can be None)

    Returns:
        True if the item was successfully removed, False otherwise
    """
    if item is None:
        return False

    try:
        scene = item.scene()
        if scene is not None:
            scene.removeItem(item)
            return True
    except RuntimeError:
        # Item was already removed or scene is in inconsistent state
        logger.debug(f"Item already removed from scene: {type(item).__name__}")
    except Exception as e:
        logger.warning(f"Unexpected error removing item from scene: {e}")

    return False


def safe_remove_from_scene(
    item: QGraphicsItem | None,
    scene: QGraphicsScene | None,
) -> bool:
    """Safely remove an item from a specific scene.

    This is useful when you already have a reference to the scene
    and want to ensure the item belongs to that scene.

    Args:
        item: The graphics item to remove (can be None)
        scene: The scene to remove from (can be None)

    Returns:
        True if the item was successfully removed, False otherwise
    """
    if item is None or scene is None:
        return False

    try:
        item_scene = item.scene()
        if item_scene is scene:
            scene.removeItem(item)
            return True
        elif item_scene is not None:
            # Item belongs to a different scene
            logger.debug(f"Item belongs to different scene: {type(item).__name__}")
    except RuntimeError:
        logger.debug(f"Item already removed from scene: {type(item).__name__}")
    except Exception as e:
        logger.warning(f"Unexpected error removing item from scene: {e}")

    return False


def clear_scene_items(
    items: Iterable[QGraphicsItem | None],
    scene: QGraphicsScene | None = None,
) -> int:
    """Clear multiple items from their scenes.

    This function iterates through a collection of items and safely
    removes each one. It handles None items and already-removed items
    gracefully.

    Args:
        items: Iterable of graphics items to remove
        scene: Optional specific scene to remove from. If provided,
               only items belonging to this scene will be removed.

    Returns:
        The number of items successfully removed
    """
    removed_count = 0

    for item in items:
        if item is None:
            continue

        if scene is not None:
            if safe_remove_from_scene(item, scene):
                removed_count += 1
        else:
            if safe_remove_item(item):
                removed_count += 1

    return removed_count


def clear_scene_items_by_type(
    scene: QGraphicsScene,
    item_type: type,
) -> int:
    """Remove all items of a specific type from a scene.

    Args:
        scene: The scene to clear items from
        item_type: The type of items to remove (e.g., QGraphicsEllipseItem)

    Returns:
        The number of items removed
    """
    if scene is None:
        return 0

    removed_count = 0
    for item in scene.items():
        if isinstance(item, item_type) and safe_remove_item(item):
            removed_count += 1

    return removed_count


def clear_items_and_list(
    items_list: list,
    scene: QGraphicsScene | None = None,
) -> int:
    """Clear items from scene and empty the list.

    This is a convenience function that combines clearing items
    and resetting the list in one call.

    Args:
        items_list: List of items to clear (will be emptied)
        scene: Optional specific scene to remove from

    Returns:
        The number of items successfully removed
    """
    removed_count = clear_scene_items(items_list, scene)
    items_list.clear()
    return removed_count


def ensure_item_in_scene(
    item: QGraphicsItem,
    scene: QGraphicsScene,
) -> bool:
    """Ensure an item is in the specified scene.

    If the item is already in the scene, returns True.
    If the item is in a different scene, raises SceneError.
    If the item is not in any scene, adds it to the scene.

    Args:
        item: The item to ensure is in the scene
        scene: The target scene

    Returns:
        True if item is now in the scene

    Raises:
        SceneError: If the item is in a different scene
    """
    current_scene = item.scene()

    if current_scene is scene:
        return True

    if current_scene is not None:
        raise SceneError(
            "ensure_item_in_scene",
            f"Item {type(item).__name__} already belongs to a different scene",
        )

    scene.addItem(item)
    return True
