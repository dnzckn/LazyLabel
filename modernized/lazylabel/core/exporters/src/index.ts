/**
 * Public surface of the LazyLabel annotation format library.
 *
 * Writers return file CONTENT rather than writing to disk, so the same code serves the browser,
 * the API and the differential tests. Callers pair the content with `outputPathFor`. A writer
 * returns null exactly where the legacy exporter writes no file, which means "write nothing", not
 * "delete": exporting never removes another format's file.
 *
 * Text output always uses "\n". The legacy writers open files in text mode, so their bytes carry
 * the host's line ending (CRLF on Windows); MODERNIZATION_BRIEF.md decision 10 settles that
 * differential tests compare after normalizing line endings.
 *
 * The NPZ writers are async because they compress through the platform's deflate stream; the text
 * and XML writers are synchronous.
 */

export * from "./types.js";
export { outputPathFor } from "./paths.js";

export { pyRepr } from "./format/pyRepr.js";
export { MalformedAnnotationError } from "./format/labels.js";

export { renderYoloSegmentation, parseYoloSegmentation } from "./format/yoloSegmentation.js";
export { renderYoloDetection, parseYoloDetection } from "./format/yoloDetection.js";
export { renderCoco, parseCoco } from "./format/coco.js";
export { renderPascalVoc, parsePascalVoc } from "./format/pascalVoc.js";
export { renderCreateMl, parseCreateMl } from "./format/createMl.js";
export { renderNpz, parseNpz } from "./format/npz.js";
export { renderNpzClassMap, parseNpzClassMap } from "./format/npzClassMap.js";

export {
  createFinalMaskTensor,
  createInstanceContours,
  applyCrop,
  applyPixelPriority,
  rasterizeSegment,
} from "./mask/tensor.js";
