"""NPZ class map exporter — single-channel semantic segmentation label map."""

from __future__ import annotations

import os

import numpy as np

from . import ExportContext, ExportFormat, _register


class NpzClassMapExporter:
    """Save a class map (H, W) where each pixel stores its class index.

    Background (no class active) = 0.
    Where multiple classes overlap, the lowest channel index wins
    (np.argmax returns first occurrence of max value).
    """

    def export(self, ctx: ExportContext) -> str | None:
        if ctx.mask_tensor.size == 0:
            return None

        # Skip if no class is active anywhere
        if not np.any(ctx.mask_tensor):
            return None

        class_map = self._one_hot_to_class_map(ctx.mask_tensor, ctx.class_order)

        path = self.get_output_path(ctx.image_path)
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        np.savez_compressed(
            path,
            class_map=class_map,
            class_order=np.array(ctx.class_order),
            class_aliases=ctx.class_aliases,
        )
        return path

    def get_output_path(self, image_path: str) -> str:
        return os.path.splitext(image_path)[0] + "_CM.npz"

    def delete_output(self, image_path: str) -> bool:
        path = self.get_output_path(image_path)
        if os.path.exists(path):
            os.remove(path)
            return True
        return False

    @staticmethod
    def _one_hot_to_class_map(
        mask_tensor: np.ndarray, class_order: list[int]
    ) -> np.ndarray:
        """Convert (H, W, C) one-hot → (H, W) class map.

        Background (no class active) = 0.
        Where multiple classes overlap, the lowest channel index wins
        (np.argmax returns first occurrence of max value).
        """
        h, w, c = mask_tensor.shape
        class_map = np.zeros((h, w), dtype=np.uint16)
        any_active = np.any(mask_tensor > 0, axis=2)
        if c > 0:
            winner = np.argmax(mask_tensor, axis=2)
            class_id_lut = np.array(class_order, dtype=np.uint16)
            class_map[any_active] = class_id_lut[winner[any_active]]
        return class_map


_register(ExportFormat.NPZ_CLASS_MAP, NpzClassMapExporter(), {"_CM.npz"})
