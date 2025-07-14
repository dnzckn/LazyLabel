import numpy as np
from PyQt6.QtGui import QImage, QPixmap


def mask_to_pixmap(mask, color, alpha=150):
    colored_mask = np.zeros((mask.shape[0], mask.shape[1], 4), dtype=np.uint8)
    colored_mask[mask, :3] = color
    colored_mask[mask, 3] = alpha
    image = QImage(
        colored_mask.data, mask.shape[1], mask.shape[0], QImage.Format.Format_RGBA8888
    )
    return QPixmap.fromImage(image)
