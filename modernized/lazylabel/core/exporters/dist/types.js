/**
 * Shared types for the LazyLabel annotation format library.
 *
 * These mirror the legacy `ExportContext` (legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:97-120)
 * closely enough to keep the rule cards readable, while using web-native shapes: flat typed arrays
 * instead of numpy tensors, and plain objects instead of dataclasses.
 *
 * Sizes are (height, width) throughout, because the legacy context stores them that way and every
 * rule card is written against that order.
 */
/**
 * Order in which annotation files are trusted when an image has several.
 * Mirrors LOAD_PRIORITY (legacy exporters/__init__.py:73-81) and FileManager._LOAD_CHAIN.
 */
export const LOAD_PRIORITY = [
    "NPZ",
    "YOLO_SEGMENTATION",
    "COCO_JSON",
    "NPZ_CLASS_MAP",
    "PASCAL_VOC",
    "CREATEML",
    "YOLO_DETECTION",
];
/** File name suffix each format appends to the image's base name. */
export const FORMAT_SUFFIX = {
    NPZ: ".npz",
    NPZ_CLASS_MAP: "_CM.npz",
    YOLO_DETECTION: ".txt",
    YOLO_SEGMENTATION: "_seg.txt",
    COCO_JSON: "_coco.json",
    PASCAL_VOC: ".xml",
    CREATEML: "_createml.json",
};
//# sourceMappingURL=types.js.map