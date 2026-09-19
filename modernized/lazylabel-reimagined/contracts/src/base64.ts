/**
 * Base64 for bytes, in both a browser and Node.
 *
 * The API had used `Buffer`, which does not exist in a browser, and the web app would have reached
 * for `atob`/`btoa`. Two encoders for one wire format is how a mask starts arriving subtly wrong on
 * one side only — so there is one, here, and both sides import it.
 *
 * `btoa` and `atob` are the common denominator: they are global in browsers and in Node since 16.
 * They work on "binary strings", one character per byte, which is exactly what a mask is.
 *
 * The chunking matters. `String.fromCharCode(...bytes)` on a large array throws
 * RangeError: Maximum call stack size exceeded, and a mask region is routinely large enough to hit
 * it — a 2000x2000 object is four million bytes.
 */

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
