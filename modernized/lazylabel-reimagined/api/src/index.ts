/**
 * Public surface of the LazyLabel API package.
 *
 * Exported so the acceptance tests, and later the web app's development server, can build the app
 * with whichever adapters they need rather than starting a process.
 */

export { createApp, MAX_BODY_BYTES, type ApiRequest, type ApiResponse, type App, type AppDeps } from "./app.js";
export { createServer } from "./server.js";
export { loadConfig, ConfigError, type Config } from "./config.js";

export { CAPABILITIES, capability, type Capability, type ApiStatus } from "./capabilities.js";

export {
  InvalidKeyError,
  RevisionConflictError,
  type BlobStat,
  type BlobStore,
} from "./ports/blobStore.js";
export type { MetadataStore } from "./ports/metadataStore.js";

export { DirectoryBlobStore } from "./adapters/directoryBlobStore.js";
export { MemoryBlobStore } from "./adapters/memoryBlobStore.js";
export { SqliteMetadataStore } from "./adapters/sqliteMetadataStore.js";

export {
  readAnnotations,
  writeAnnotations,
  AnnotationLoadError,
  type AnnotationsRead,
  type WriteRequest,
  type WriteResult,
} from "./annotations/service.js";
export {
  IMAGE_EXTENSIONS,
  isImageKey,
  isSidecarKey,
  sidecarCollisions,
  sidecarKeysFor,
} from "./annotations/sidecars.js";

export {
  DEFAULT_HOTKEYS,
  DEFAULT_SETTINGS,
  SETTINGS_SCHEMA_VERSION,
  defaultSettings,
  type HotkeyAction,
  type HotkeyBinding,
  type StoredSettings,
} from "./settings/schema.js";
export {
  importLegacySettings,
  type ImportResult,
  type ImportWarning,
} from "./settings/importLegacy.js";

export { createLogger, silentLogger, type Logger, type LogLevel } from "./http/log.js";
export { HttpError, type Problem } from "./http/problem.js";
export { encodeMask, decodeMask, encodeLoadResponse, type WireMask } from "./http/wire.js";
