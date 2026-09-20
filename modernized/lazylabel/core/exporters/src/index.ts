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
// `stripExtension` is exported alongside it because the API needs the same `os.path.splitext`
// semantics to group an image with its sidecars; a second implementation of that rule is exactly
// the drift this library exists to prevent.
export { outputPathFor, stripExtension } from "./paths.js";

export { pyRepr } from "./format/pyRepr.js";
export { MalformedAnnotationError } from "./format/labels.js";
export { MalformedXmlError } from "./format/xml.js";
export { CompressionError } from "./util/zip.js";

// Choosing which annotation file wins, and reporting the ones that cannot be read.
export {
  loadAnnotations,
  AnnotationLoadError,
  type AnnotationSources,
  type LoadOutcome,
} from "./load/chain.js";

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

// The geometry the web app's fragment filter needs. Exported rather than reimplemented there:
// these are proven against OpenCV, and a second contour tracer would be a second thing to prove.
export {
  approxPolyDP,
  arcLength,
  contourArea,
  fillPoly,
  findExternalContours,
} from "./geometry/contours.js";
// `arcLength` and `approxPolyDP` join them for the web app's Auto-Convert, which turns an AI mask
// into an editable polygon. Same reason as the three above: these are the OpenCV ports proven
// against goldens legacy wrote, and a second approximation in the browser would be a second answer
// to a question with one right one.
