/**
 * Label parsing and class-id resolution shared by every text and XML importer.
 *
 * Ported from FileManager._build_label_map (legacy/lazylabel/src/lazylabel/core/file_manager.py:345-379)
 * and the float/int parsing the loaders rely on. Implements the rule card
 * "Label text to class ID resolution on import".
 */

/**
 * Resolve every label in ONE annotation file to a class id.
 *
 * Order per label: an existing alias wins, then a plain integer, then a freshly assigned id.
 * Assignment happens only after every numeric label in the file has claimed its id, so a file
 * mixing "dog" with "0" does not hand both the same id and merge two classes into one. Newly
 * assigned ids are registered as aliases so the name survives the round trip.
 */
export function buildLabelMap(
  labels: readonly string[],
  existingAliases: ReadonlyMap<number, string>,
): { labelMap: Map<string, number>; aliases: Map<number, string> } {
  const reverse = new Map<string, number>();
  for (const [id, alias] of existingAliases) reverse.set(alias, id);

  const labelMap = new Map<string, number>();
  const unnamed: string[] = [];
  for (const label of labels) {
    if (labelMap.has(label) || unnamed.includes(label)) continue;
    const aliased = reverse.get(label);
    if (aliased !== undefined) {
      labelMap.set(label, aliased);
      continue;
    }
    const asInt = parseIntLikePython(label);
    if (asInt !== null) labelMap.set(label, asInt);
    else unnamed.push(label);
  }

  const taken = new Set<number>([...existingAliases.keys(), ...labelMap.values()]);
  const aliases = new Map<number, string>(existingAliases);
  let nextId = 0;
  for (const label of unnamed) {
    while (taken.has(nextId)) nextId += 1;
    labelMap.set(label, nextId);
    taken.add(nextId);
    aliases.set(nextId, label);
  }
  return { labelMap, aliases };
}

/**
 * Python's float(): accepts "nan", "inf", "infinity", a leading "+" and surrounding whitespace,
 * and rejects "", "0x10" and "1_0" that JavaScript's Number() would take or mis-take.
 *
 * Returns null where float() raises ValueError, which makes the caller skip that line. A returned
 * NaN or Infinity is NOT a parse failure: the legacy loaders accept it here and then raise later,
 * when int(round(...)) is applied, which discards the whole file rather than one line.
 */
export function parseFloatLikePython(token: string): number | null {
  const text = token.trim();
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) return Number(text);
  const special = /^([+-]?)(nan|inf|infinity)$/i.exec(text);
  if (!special) return null;
  if (/nan/i.test(special[2]!)) return Number.NaN;
  return special[1] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
}

/** Python's int(): optional sign then digits. Number() would accept "1.5" and "0x10". */
export function parseIntLikePython(token: string): number | null {
  const text = token.trim();
  return /^[+-]?\d+$/.test(text) ? Number.parseInt(text, 10) : null;
}

/**
 * Raised when a coordinate is not finite.
 *
 * The legacy loaders let "nan" and "inf" through float() and then hit int(round(...)), which raises
 * OUTSIDE their per-line try block, so the entire file is discarded rather than one line skipped.
 * Reproducing the whole-file abort matters: skipping just the line would draw polygons the legacy
 * app never draws. Decision 15c requires the caller to report this rather than fall through to a
 * lower-priority file.
 */
export class MalformedAnnotationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedAnnotationError";
  }
}

/** Mirror int(round(value)): round-half-to-even, then refuse a non-finite result. */
export function toPixel(value: number, what: string): number {
  if (!Number.isFinite(value)) {
    throw new MalformedAnnotationError(`${what} is ${value}; the whole file is rejected, as in legacy`);
  }
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}
