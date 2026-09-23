# @lazylabel/contracts

The HTTP wire contract between the web app and the API: request and response shapes, and the mask
codec both sides use.

It exists because the browser has to decode exactly what the server encoded. A binary layout
implemented twice does not stay identical, and the failure would appear as a mask that arrives
subtly wrong in a browser and nowhere else — the hardest kind of bug to see.

## Bounded masks

Masks travel as a bounding box plus the pixels inside it, base64-encoded. The obvious encoding, a
full-image plane per segment, is what the memory NFR exists to forbid: 500 objects on a 50-megapixel
image is 25 GB of ones and zeros, almost all of them zero.

**One bit per pixel** (`packing: "bits"`) since 2026-09-23, first pixel in the most significant bit
-- NumPy's `packbits` order, so the Python service and this package agree without either
translating. The spec's latency budget, p95 of 150 ms from click to mask on a 12-megapixel image,
was measured that day for the first time and missed: at a byte per pixel a large mask was
megabytes of base64 a click, and over HTTP the p95 was 342 ms. Packed, it is 114 ms. A payload
without `packing` is one byte per pixel, and every decoder still reads it.

**`maskRegion` is the only way to read a mask's pixels outside the codec.** Four readers in the web
app -- the canvas, erase, selection and the sequence references -- parsed `data` themselves, which
is four implementations of the layout this package exists to have one of, and packing the bits
would have broken all four with no type error, because `data` is a string either way.

Base64 is `btoa`/`atob` rather than `Buffer`, which does not exist in a browser — and it chunks,
because `String.fromCharCode(...bytes)` throws `RangeError` above roughly 100k arguments and a
2000×2000 object is four million bytes.

## Provisional

Phase 4 builds the real client and the wire format is its to settle. What is fixed now is only what
`AI_NATIVE_SPEC.md` section 3 already promises: a load carries its source format, the names the file
established, the count it rejected, and every failure it walked past. Those exist so a client can
say "412 unreadable lines" instead of showing an empty canvas, and they are the part worth getting
right before there is a client to get it wrong.
