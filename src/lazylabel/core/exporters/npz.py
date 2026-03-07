"""NPZ mask tensor exporter."""

from __future__ import annotations

import os

import numpy as np

from . import ExportContext, ExportFormat, _register


class NpzExporter:
    """Save the final mask tensor as a compressed NumPy NPZ file."""

    def export(self, ctx: ExportContext) -> str | None:
        if ctx.mask_tensor.size == 0:
            return None

        path = self.get_output_path(ctx.image_path)
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        np.savez_compressed(
            path,
            mask=ctx.mask_tensor.astype(np.uint8),
            class_order=np.array(ctx.class_order),
            class_aliases=ctx.class_aliases,
        )
        return path

    def get_output_path(self, image_path: str) -> str:
        return os.path.splitext(image_path)[0] + ".npz"

    def delete_output(self, image_path: str) -> bool:
        path = self.get_output_path(image_path)
        if os.path.exists(path):
            os.remove(path)
            return True
        return False


_register(ExportFormat.NPZ, NpzExporter(), {".npz"})
