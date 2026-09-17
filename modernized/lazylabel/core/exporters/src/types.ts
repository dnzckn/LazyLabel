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

/** A binary mask over one image, row-major, one byte per pixel (0 or 1). */
export interface BinaryMask {
  readonly height: number;
  readonly width: number;
  readonly data: Uint8Array;
}

/**
 * One-hot mask tensor: one binary channel per entry of `classOrder`, row-major, channel-last,
 * so pixel (y, x) of channel c is at `(y * width + x) * classOrder.length + c`.
 */
export interface MaskTensor {
  readonly height: number;
  readonly width: number;
  readonly classOrder: readonly number[];
  readonly data: Uint8Array;
}

/** A segment as the annotation store holds it. */
export interface Segment {
  readonly type: "AI" | "Loaded" | "Polygon" | "Circle";
  readonly classId: number | null;
  /** Set for AI and Loaded segments; Polygon and Circle are rasterized on demand. */
  readonly mask?: BinaryMask;
  /** For Polygon, the outline. For Circle, exactly [centre, pointOnRadius]. */
  readonly vertices?: readonly (readonly [number, number])[];
}

/** One traced object outline, as the instance-aware formats consume it. */
export interface InstanceContour {
  /** Index into `classOrder`, not the class id. */
  readonly channel: number;
  /** Closed outline in pixel coordinates, in OpenCV's traversal order. */
  readonly contour: readonly (readonly [number, number])[];
}

/** Everything a writer needs. Mirrors the legacy ExportContext field for field. */
export interface ExportContext {
  /** Path of the image the annotations belong to; only its base name and directory are used. */
  readonly imagePath: string;
  /** [height, width] of the full image, never the crop. */
  readonly imageSize: readonly [number, number];
  /** Sorted unique class ids present in this image. */
  readonly classOrder: readonly number[];
  /** Display label per entry of `classOrder`, alias if one is set, otherwise the id as text. */
  readonly classLabels: readonly string[];
  readonly classAliases: ReadonlyMap<number, string>;
  readonly maskTensor: MaskTensor;
  /** [x1, y1, x2, y2] as stored by the crop tool: clamped inclusively, applied exclusively. */
  readonly cropCoords: readonly [number, number, number, number] | null;
  /** Empty means "no instance information", which makes writers fall back to merged channels. */
  readonly instances: readonly InstanceContour[];
}

/** The seven formats, named as the legacy ExportFormat enum names them. */
export type AnnotationFormat =
  | "NPZ"
  | "NPZ_CLASS_MAP"
  | "YOLO_DETECTION"
  | "YOLO_SEGMENTATION"
  | "COCO_JSON"
  | "PASCAL_VOC"
  | "CREATEML";

/**
 * Order in which annotation files are trusted when an image has several.
 * Mirrors LOAD_PRIORITY (legacy exporters/__init__.py:73-81) and FileManager._LOAD_CHAIN.
 */
export const LOAD_PRIORITY: readonly AnnotationFormat[] = [
  "NPZ",
  "YOLO_SEGMENTATION",
  "COCO_JSON",
  "NPZ_CLASS_MAP",
  "PASCAL_VOC",
  "CREATEML",
  "YOLO_DETECTION",
] as const;

/** File name suffix each format appends to the image's base name. */
export const FORMAT_SUFFIX: Readonly<Record<AnnotationFormat, string>> = {
  NPZ: ".npz",
  NPZ_CLASS_MAP: "_CM.npz",
  YOLO_DETECTION: ".txt",
  YOLO_SEGMENTATION: "_seg.txt",
  COCO_JSON: "_coco.json",
  PASCAL_VOC: ".xml",
  CREATEML: "_createml.json",
} as const;

/** A parsed annotation file, as the readers return it. */
export interface LoadedAnnotations {
  readonly segments: readonly Segment[];
  /** Aliases the file carried, by class id. Empty when the format stores no names. */
  readonly classAliases: ReadonlyMap<number, string>;
}
