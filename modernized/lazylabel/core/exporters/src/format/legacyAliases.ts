/**
 * The desktop app's class-name table, read and written as DATA.
 *
 * Every NPZ legacy LazyLabel writes holds its class names as `class_aliases`: a 0-d NumPy object
 * array wrapping a Python dict, which `np.savez` stores as a pickle. Loading a pickle in PYTHON runs
 * whatever the file says, which is why SEC-01 kept the web stack from loading one. This module does
 * not load one either. It walks the pickle's opcodes as a data format -- nothing here can call
 * anything; there is no Python to call -- and accepts exactly the shape legacy writes: `_reconstruct`
 * of an `ndarray` with dtype `O8`, holding one dict of integer ids to strings. Anything else, any
 * other global, any other opcode, is refused, and the names are then reported unreadable as before.
 *
 * The owner's decision of 2026-09-25: the web app handles `.npz` files exactly as the desktop app
 * does, so names cross between the two in both directions with no converter.
 *
 * Writing emits the same structure as a protocol-2 pickle naming `numpy.core.multiarray`, which
 * NumPy 1.x and 2.x both load (checked on 2.2.6, with no warning).
 */

const OBJECT_ARRAY_HEADER = "{'descr': '|O', 'fortran_order': False, 'shape': (), }";

/** The globals legacy's table needs, and nothing else. */
const ALLOWED_GLOBALS = new Set([
  "numpy._core.multiarray._reconstruct",
  "numpy.core.multiarray._reconstruct",
  "numpy.ndarray",
  "numpy.dtype",
]);

const MAX_PAYLOAD = 1 << 20;
const MAX_OPS = 200_000;

type Value =
  | number
  | string
  | boolean
  | null
  | Uint8Array
  | Value[]
  | { readonly kind: "tuple"; readonly items: Value[] }
  | { readonly kind: "dict"; readonly entries: Map<Value, Value> }
  | { readonly kind: "global"; readonly name: string }
  | { readonly kind: "reduce"; readonly fn: Value; readonly args: Value; state?: Value };

const MARK = Symbol("mark");
type Slot = Value | typeof MARK;

class Refused extends Error {}

/** The names from a legacy `class_aliases` member, or null when it is not the shape legacy writes. */
export function readLegacyAliasNpy(npy: Uint8Array): Map<number, string> | null {
  try {
    const payload = npyBody(npy);
    return extractNames(runPickle(payload));
  } catch {
    return null;
  }
}

function npyBody(npy: Uint8Array): Uint8Array {
  if (npy.length < 10 || npy[0] !== 0x93 || String.fromCharCode(...npy.subarray(1, 6)) !== "NUMPY") {
    throw new Refused("not an .npy member");
  }
  const major = npy[6]!;
  const view = new DataView(npy.buffer, npy.byteOffset, npy.byteLength);
  const lengthBytes = major === 1 ? 2 : 4;
  const headerLength = lengthBytes === 2 ? view.getUint16(8, true) : view.getUint32(8, true);
  const start = 8 + lengthBytes;
  const header = new TextDecoder("latin1").decode(npy.subarray(start, start + headerLength));
  if (!/'descr':\s*'\|O'/.test(header) || !/'shape':\s*\(\s*\)/.test(header)) {
    throw new Refused("not a 0-d object array");
  }
  const body = npy.subarray(start + headerLength);
  if (body.length > MAX_PAYLOAD) throw new Refused("table too large");
  return body;
}

function runPickle(bytes: Uint8Array): Value {
  const stack: Slot[] = [];
  const memo = new Map<number, Value>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = new TextDecoder("utf-8", { fatal: true });
  let at = 0;
  let ops = 0;

  const need = (count: number) => {
    if (at + count > bytes.length) throw new Refused("truncated pickle");
  };
  const u8 = () => (need(1), bytes[at++]!);
  const u16 = () => (need(2), (at += 2), view.getUint16(at - 2, true));
  const u32 = () => (need(4), (at += 4), view.getUint32(at - 4, true));
  const i32 = () => (need(4), (at += 4), view.getInt32(at - 4, true));
  const take = (count: number) => (need(count), (at += count), bytes.subarray(at - count, at));
  const line = () => {
    const end = bytes.indexOf(0x0a, at);
    if (end < 0) throw new Refused("unterminated line");
    const out = new TextDecoder("latin1").decode(bytes.subarray(at, end));
    at = end + 1;
    return out;
  };
  const pop = (): Value => {
    const top = stack.pop();
    if (top === undefined || top === MARK) throw new Refused("stack underflow");
    return top;
  };
  const popMark = (): Value[] => {
    const at = stack.lastIndexOf(MARK);
    if (at < 0) throw new Refused("no mark");
    const items = stack.splice(at) as Slot[];
    return items.slice(1) as Value[];
  };
  const global = (name: string): Value => {
    if (!ALLOWED_GLOBALS.has(name)) throw new Refused(`refused global ${name}`);
    return { kind: "global", name };
  };
  const top = (): Value => {
    const value = stack[stack.length - 1];
    if (value === undefined || value === MARK) throw new Refused("stack underflow");
    return value;
  };
  const dictOf = (value: Value) => {
    if (typeof value !== "object" || value === null || !("kind" in value) || value.kind !== "dict") {
      throw new Refused("not a dict");
    }
    return value.entries;
  };

  for (;;) {
    if ((ops += 1) > MAX_OPS) throw new Refused("too many operations");
    const op = u8();
    switch (op) {
      case 0x80: u8(); break; // PROTO
      case 0x95: take(8); break; // FRAME: a length hint only
      case 0x94: memo.set(memo.size, top()); break; // MEMOIZE
      case 0x71: memo.set(u8(), top()); break; // BINPUT
      case 0x72: memo.set(u32(), top()); break; // LONG_BINPUT
      case 0x68: { const v = memo.get(u8()); if (v === undefined) throw new Refused("bad memo"); stack.push(v); break; } // BINGET
      case 0x6a: { const v = memo.get(u32()); if (v === undefined) throw new Refused("bad memo"); stack.push(v); break; } // LONG_BINGET
      case 0x8c: stack.push(text.decode(take(u8()))); break; // SHORT_BINUNICODE
      case 0x58: stack.push(text.decode(take(u32()))); break; // BINUNICODE
      case 0x43: stack.push(take(u8()).slice()); break; // SHORT_BINBYTES
      case 0x42: stack.push(take(u32()).slice()); break; // BINBYTES
      case 0x4b: stack.push(u8()); break; // BININT1
      case 0x4d: stack.push(u16()); break; // BININT2
      case 0x4a: stack.push(i32()); break; // BININT
      case 0x8a: { // LONG1: little-endian two's complement, at most 6 bytes to stay exact
        const count = u8();
        if (count > 6) throw new Refused("integer too large");
        const raw = take(count);
        let value = 0;
        for (let i = count - 1; i >= 0; i -= 1) value = value * 256 + raw[i]!;
        if (count > 0 && raw[count - 1]! >= 0x80) value -= 2 ** (8 * count);
        stack.push(value);
        break;
      }
      case 0x4e: stack.push(null); break; // NONE
      case 0x88: stack.push(true); break; // NEWTRUE
      case 0x89: stack.push(false); break; // NEWFALSE
      case 0x29: stack.push({ kind: "tuple", items: [] }); break; // EMPTY_TUPLE
      case 0x85: stack.push({ kind: "tuple", items: [pop()] }); break; // TUPLE1
      case 0x86: { const b = pop(); const a = pop(); stack.push({ kind: "tuple", items: [a, b] }); break; } // TUPLE2
      case 0x87: { const c = pop(); const b = pop(); const a = pop(); stack.push({ kind: "tuple", items: [a, b, c] }); break; } // TUPLE3
      case 0x28: stack.push(MARK); break; // MARK
      case 0x74: stack.push({ kind: "tuple", items: popMark() }); break; // TUPLE
      case 0x5d: stack.push([]); break; // EMPTY_LIST
      case 0x7d: stack.push({ kind: "dict", entries: new Map() }); break; // EMPTY_DICT
      case 0x61: { const item = pop(); const list = top(); if (!Array.isArray(list)) throw new Refused("not a list"); list.push(item); break; } // APPEND
      case 0x65: { const items = popMark(); const list = top(); if (!Array.isArray(list)) throw new Refused("not a list"); list.push(...items); break; } // APPENDS
      case 0x73: { const value = pop(); const key = pop(); dictOf(top()).set(key, value); break; } // SETITEM
      case 0x75: { // SETITEMS
        const items = popMark();
        if (items.length % 2 !== 0) throw new Refused("odd SETITEMS");
        const entries = dictOf(top());
        for (let i = 0; i < items.length; i += 2) entries.set(items[i]!, items[i + 1]!);
        break;
      }
      case 0x63: { const module = line(); const name = line(); stack.push(global(`${module}.${name}`)); break; } // GLOBAL
      case 0x93: { // STACK_GLOBAL
        const name = pop();
        const module = pop();
        if (typeof module !== "string" || typeof name !== "string") throw new Refused("bad global");
        stack.push(global(`${module}.${name}`));
        break;
      }
      case 0x52: { const args = pop(); const fn = pop(); stack.push({ kind: "reduce", fn, args }); break; } // REDUCE: recorded, never called
      case 0x62: { // BUILD: recorded, never applied
        const state = pop();
        const target = top();
        if (typeof target !== "object" || target === null || !("kind" in target) || target.kind !== "reduce") {
          throw new Refused("BUILD on a non-object");
        }
        target.state = state;
        break;
      }
      case 0x2e: { const result = pop(); if (stack.length !== 0) throw new Refused("stack not empty at STOP"); return result; } // STOP
      default:
        throw new Refused(`opcode 0x${op.toString(16)} is not part of legacy's table`);
    }
  }
}

/** The dict inside `_reconstruct(ndarray, ...)` with an `O8` dtype, as ids to names. */
function extractNames(root: Value): Map<number, string> {
  const isReduce = (v: Value): v is Extract<Value, { kind: "reduce" }> =>
    typeof v === "object" && v !== null && "kind" in v && v.kind === "reduce";
  const isGlobal = (v: Value, suffix: string) =>
    typeof v === "object" && v !== null && "kind" in v && v.kind === "global" && v.name.endsWith(suffix);
  const tupleItems = (v: Value | undefined): Value[] => {
    if (typeof v !== "object" || v === null || !("kind" in v) || v.kind !== "tuple") throw new Refused("not a tuple");
    return v.items;
  };

  if (!isReduce(root) || !isGlobal(root.fn, "multiarray._reconstruct")) throw new Refused("not an array");
  if (!isGlobal(tupleItems(root.args)[0]!, "numpy.ndarray")) throw new Refused("not an ndarray");
  const state = tupleItems(root.state);
  const dtype = state[2];
  if (dtype === undefined || !isReduce(dtype) || !isGlobal(dtype.fn, "numpy.dtype")) throw new Refused("no dtype");
  if (tupleItems(dtype.args)[0] !== "O8") throw new Refused("not an object array");
  const contents = state[4];
  if (!Array.isArray(contents) || contents.length !== 1) throw new Refused("not one object");
  const table = contents[0]!;
  if (typeof table !== "object" || table === null || !("kind" in table) || table.kind !== "dict") {
    throw new Refused("the object is not a dict");
  }
  const names = new Map<number, string>();
  for (const [id, name] of table.entries) {
    if (typeof id !== "number" || !Number.isInteger(id) || typeof name !== "string") throw new Refused("not ids to names");
    names.set(id, name);
  }
  return names;
}

/** Legacy's `class_aliases` member for these names: an .npy holding the pickled object array. */
export function encodeLegacyAliasNpy(aliases: ReadonlyMap<number, string>): Uint8Array {
  const parts: number[] = [];
  const bytes = (...values: number[]) => parts.push(...values);
  const ascii = (value: string) => bytes(...Array.from(value, (c) => c.charCodeAt(0)));
  const u32 = (value: number) => bytes(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
  const unicode = (value: string) => {
    const encoded = new TextEncoder().encode(value);
    bytes(0x58);
    u32(encoded.length);
    for (const byte of encoded) parts.push(byte); // a loop, since a long name overflows a spread
  };
  const integer = (value: number) => {
    if (value >= 0 && value < 256) bytes(0x4b, value);
    else if (value >= 0 && value < 65536) bytes(0x4d, value & 0xff, value >> 8);
    else if (value >= -(2 ** 31) && value < 2 ** 31) { bytes(0x4a); u32(value >>> 0); }
    else throw new RangeError(`class id ${value} is out of range`);
  };

  bytes(0x80, 0x02); // PROTO 2
  ascii("cnumpy.core.multiarray\n_reconstruct\n");
  ascii("cnumpy\nndarray\n");
  bytes(0x4b, 0x00, 0x85); // (0,)
  bytes(0x43, 0x01, 0x62); // b'b'
  bytes(0x87, 0x52); // TUPLE3, REDUCE
  bytes(0x28, 0x4b, 0x01, 0x29); // MARK 1 ()
  ascii("cnumpy\ndtype\n");
  unicode("O8");
  bytes(0x89, 0x88, 0x87, 0x52); // False True TUPLE3 REDUCE
  bytes(0x28, 0x4b, 0x03);
  unicode("|");
  bytes(0x4e, 0x4e, 0x4e, 0x4a, 0xff, 0xff, 0xff, 0xff, 0x4a, 0xff, 0xff, 0xff, 0xff, 0x4b, 0x3f, 0x74, 0x62);
  bytes(0x89, 0x5d, 0x7d, 0x28); // False [] {} MARK
  for (const [id, name] of [...aliases].sort(([a], [b]) => a - b)) {
    integer(id);
    unicode(name);
  }
  bytes(0x75, 0x61, 0x74, 0x62, 0x2e); // SETITEMS APPEND TUPLE BUILD STOP

  // The .npy wrapper, padded so the data starts on a 64-byte boundary, as NumPy writes it.
  const padding = 64 - ((10 + OBJECT_ARRAY_HEADER.length + 1) % 64);
  const header = `${OBJECT_ARRAY_HEADER}${" ".repeat(padding)}\n`;
  const out = new Uint8Array(10 + header.length + parts.length);
  out.set([0x93, ...Array.from("NUMPY", (c) => c.charCodeAt(0)), 1, 0, header.length & 0xff, header.length >> 8]);
  out.set(Array.from(header, (c) => c.charCodeAt(0)), 10);
  out.set(parts, 10 + header.length);
  return out;
}
