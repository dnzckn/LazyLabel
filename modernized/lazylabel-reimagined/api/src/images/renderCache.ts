/**
 * The rendered-pixel cache, and the defect it is built not to have.
 *
 * RULE-030 records a suspected defect in legacy: its cached spectrum is keyed only by the image
 * DIMENSIONS, so it is not invalidated when the rescale or channel-threshold settings upstream of
 * it change. Change a rescale handle and the FFT can answer from the input it had before — an
 * image that is silently one edit out of date, on a tool whose whole job is to show you what the
 * numbers do.
 *
 * THE KEY HERE IS EVERY INPUT: the image, its revision, and the entire processing query. Not a
 * summary of the query, not the parameters the FFT happens to read — the query string itself, as
 * the client sent it. That makes staleness structurally impossible rather than a thing to remember
 * when adding the next parameter, which is exactly the maintenance the legacy version lost.
 *
 * It caches the rendered PNG rather than the spectrum. The transform is the expensive part but it
 * is not the only one, and a user moving a slider back and forth wants the same bytes both ways.
 *
 * Bounded by BYTES, not entries. A cap of "50 images" is a cap of anywhere between 2 MB and 2 GB
 * depending on what someone opens, which is not a cap.
 */

/**
 * What a hit returns: the PNG AND the headers that described it.
 *
 * Kept together because they are one answer. Rebuilding the headers on a hit means re-deriving the
 * width, depth and channel count without the decode that produced them, and the shortest way to do
 * that wrong is to read them back off the query string, where they are not.
 */
export interface Rendered {
  readonly bytes: Uint8Array;
  readonly headers: Readonly<Record<string, string>>;
}

export interface CacheKey {
  readonly imageKey: string;
  /** The blob's revision. A file edited under the app must not answer from the old bytes. */
  readonly revision: string;
  /** The processing query exactly as it arrived, which is every parameter by construction. */
  readonly query: string;
}

const DEFAULT_LIMIT_BYTES = 256 * 1024 * 1024;

export class RenderCache {
  /** Insertion order is eviction order: a Map iterates oldest first, and re-setting moves to the end. */
  private readonly entries = new Map<string, Rendered>();
  private bytes = 0;

  constructor(private readonly limitBytes: number = DEFAULT_LIMIT_BYTES) {}

  get(key: CacheKey): Rendered | undefined {
    const id = identify(key);
    const found = this.entries.get(id);
    if (found === undefined) return undefined;

    // Touched, so the least RECENTLY used is evicted rather than the oldest stored. A user
    // returning to the image they started on should not have paid for the five they looked at
    // since.
    this.entries.delete(id);
    this.entries.set(id, found);
    return found;
  }

  set(key: CacheKey, value: Rendered): void {
    // A single render larger than the whole budget is not cached at all, rather than emptying the
    // cache to hold one thing it will then evict.
    if (value.bytes.byteLength > this.limitBytes) return;

    const id = identify(key);
    const existing = this.entries.get(id);
    if (existing !== undefined) this.bytes -= existing.bytes.byteLength;

    this.entries.set(id, value);
    this.bytes += value.bytes.byteLength;

    while (this.bytes > this.limitBytes) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      const evicted = this.entries.get(oldest.value);
      this.entries.delete(oldest.value);
      this.bytes -= evicted?.bytes.byteLength ?? 0;
    }
  }

  /** For tests and for a health endpoint: what is being held. */
  get size(): { readonly entries: number; readonly bytes: number } {
    return { entries: this.entries.size, bytes: this.bytes };
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }
}

/**
 * The three parts joined by a character none of them can contain.
 *
 * A newline: a blob key cannot hold one (the store rejects control characters in paths) and a
 * query string percent-encodes it. Joining on something a key COULD contain is how two different
 * requests come to share an entry.
 */
function identify(key: CacheKey): string {
  return `${key.imageKey}\n${key.revision}\n${key.query}`;
}
