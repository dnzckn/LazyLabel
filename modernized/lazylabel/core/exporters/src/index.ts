/**
 * Public surface of the LazyLabel annotation format library.
 *
 * Writers return file CONTENT rather than writing to disk, so the same code serves the browser,
 * the API and the tests. Callers pair the content with `outputPathFor`. A writer returns null
 * exactly where the legacy exporter writes no file.
 *
 * Text output always uses "\n". The legacy writers open files in text mode, so their bytes carry
 * the host's line ending (CRLF on Windows); MODERNIZATION_BRIEF.md decision 10 settles that
 * differential tests compare after normalizing line endings.
 */

export * from "./types.js";
export { outputPathFor } from "./paths.js";
export { pyRepr } from "./format/pyRepr.js";
export { renderYoloSegmentation, parseYoloSegmentation } from "./format/yoloSegmentation.js";
