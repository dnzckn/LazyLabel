# @lazylabel/contracts

The HTTP wire contract between the web app and the API: request and response shapes, and the mask
codec both sides use.

It exists because the browser has to decode exactly what the server encoded. A binary layout
implemented twice does not stay identical, and the failure would appear as a mask that arrives
subtly wrong in a browser and nowhere else — the hardest kind of bug to see.

## Bounded masks

Masks travel as a bounding box plus the bytes inside it, base64-encoded. The obvious encoding, a
full-image plane per segment, is what the memory NFR exists to forbid: 500 objects on a 50-megapixel
image is 25 GB of ones and zeros, almost all of them zero.

Base64 is `btoa`/`atob` rather than `Buffer`, which does not exist in a browser — and it chunks,
because `String.fromCharCode(...bytes)` throws `RangeError` above roughly 100k arguments and a
2000×2000 object is four million bytes.

## Provisional

Phase 4 builds the real client and the wire format is its to settle. What is fixed now is only what
`AI_NATIVE_SPEC.md` section 3 already promises: a load carries its source format, the names the file
established, the count it rejected, and every failure it walked past. Those exist so a client can
say "412 unreadable lines" instead of showing an empty canvas, and they are the part worth getting
right before there is a client to get it wrong.
