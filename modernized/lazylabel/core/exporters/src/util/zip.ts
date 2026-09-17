/**
 * The slice of the zip format an .npz file needs: a flat archive of stored or deflated members,
 * no directories, no encryption, no zip64.
 *
 * Uses the platform's CompressionStream("deflate-raw"), which Node 22 and current browsers both
 * provide, so the library stays free of native dependencies and runs unchanged in the web app.
 * NumPy writes .npz with deflate (np.savez_compressed) or stored (np.savez); both are read here.
 */

import { assertWithin, DEFAULT_LIMITS, type AnnotationLimits } from "../limits.js";

const UINT32_MAX = 0xffffffff;

export interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array;
}

const SIGNATURE = { local: 0x04034b50, central: 0x02014b50, end: 0x06054b50 } as const;
const METHOD = { stored: 0, deflated: 8 } as const;

export async function writeZip(entries: readonly ZipEntry[]): Promise<Uint8Array> {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const compressed = await deflateRaw(entry.data);
    // Only take the compression if it actually helped, which also keeps tiny members readable.
    const useDeflate = compressed.length < entry.data.length;
    const body = useDeflate ? compressed : entry.data;
    const method = useDeflate ? METHOD.deflated : METHOD.stored;
    const crc = crc32(entry.data);
    assertWithin(
      body.length <= UINT32_MAX && entry.data.length <= UINT32_MAX && offset <= UINT32_MAX,
      `member ${entry.name} does not fit a zip32 archive; LazyLabel does not write zip64`,
    );

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, SIGNATURE.local, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, method, true);
    lv.setUint16(10, 0, true); // time
    lv.setUint16(12, 0x21, true); // date: 1980-01-01, so archives are reproducible
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true); // extra length
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, SIGNATURE.central, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local, body);
    centrals.push(central);
    offset += local.length + body.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, SIGNATURE.end, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return concat([...locals, ...centrals, end]);
}

export async function readZip(
  bytes: Uint8Array,
  limits: AnnotationLimits = DEFAULT_LIMITS,
): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === SIGNATURE.end) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("not a zip archive: no end-of-central-directory record");

  const count = view.getUint16(end + 10, true);
  assertWithin(
    count <= limits.maxArchiveMembers,
    `this archive declares ${count} members, over the ${limits.maxArchiveMembers} limit`,
  );
  let pointer = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  let totalUncompressed = 0;

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(pointer, true) !== SIGNATURE.central) throw new Error("corrupt zip directory");
    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(start, start + compressedSize);

    if (method !== METHOD.stored && method !== METHOD.deflated) {
      throw new Error(`unsupported zip compression method ${method} for member ${name}`);
    }
    // Check the DECLARED size before inflating: that is the whole point of a zip bomb.
    const declared = view.getUint32(pointer + 24, true);
    totalUncompressed += declared;
    assertWithin(
      totalUncompressed <= limits.maxUncompressedBytes,
      `this archive decompresses to over ${limits.maxUncompressedBytes} bytes`,
    );
    entries.push({ name, data: method === METHOD.deflated ? await inflateRaw(raw) : raw });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  return through(data, new CompressionStream("deflate-raw"));
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  return through(data, new DecompressionStream("deflate-raw"));
}

/**
 * Push bytes through a compression stream and collect the result.
 *
 * Both ends of the stream must be handled, or a corrupt archive takes the process down: when
 * inflate fails, the read side rejects first, and an unhandled rejection on the write side then
 * crashes Node even though the caller caught the error it saw. The failure is also reported with a
 * message, because the raw stream error carries an empty one, which would surface to a user as a
 * banner ending in a bare colon.
 */
async function through(
  data: Uint8Array,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  // The stream types demand a buffer that is not shared. Nothing here ever allocates a
  // SharedArrayBuffer, so assert rather than copy the mask, which can be tens of megabytes.
  const written = writer
    .write(data as Uint8Array<ArrayBuffer>)
    .then(() => writer.close())
    .catch(() => undefined); // the read side reports the real failure

  const chunks: Uint8Array[] = [];
  const reader = transform.readable.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } catch (cause) {
    const detail = cause instanceof Error && cause.message ? cause.message : String(cause);
    throw new CompressionError(`the compressed data could not be read: ${detail || "stream failed"}`, cause);
  } finally {
    await written;
  }
  return concat(chunks);
}

/** A zip member that could not be inflated: damaged, truncated, or not deflate data at all. */
export class CompressionError extends Error {
  constructor(
    message: string,
    override readonly cause: unknown,
  ) {
    super(message);
    this.name = "CompressionError";
  }
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
