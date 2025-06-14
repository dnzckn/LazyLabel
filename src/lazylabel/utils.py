import numpy as np
from PyQt6.QtGui import QImage, QPixmap


def mask_to_pixmap(mask, color):
    colored_mask = np.zeros((mask.shape[0], mask.shape[1], 4), dtype=np.uint8)
    colored_mask[mask, :3] = color
    colored_mask[mask, 3] = 150  # Alpha channel for transparency
    image = QImage(
        colored_mask.data, mask.shape[1], mask.shape[0], QImage.Format.Format_RGBA8888
    )
    return QPixmap.fromImage(image)
