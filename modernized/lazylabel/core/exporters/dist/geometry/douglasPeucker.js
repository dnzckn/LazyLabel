/**
 * OpenCV's Douglas-Peucker variant, transliterated from
 * opencv/opencv @ 4.12.0, modules/imgproc/src/approx.cpp (`approxPolyDP_<int>` and
 * the `cv::approxPolyDP` wrapper).
 *
 * This is deliberately *not* textbook Douglas-Peucker. OpenCV's version has three
 * quirks that change the output, all of which the annotation files record:
 *
 *  - For a closed curve it first runs three passes of a "farthest point" search to
 *    pick the two seed vertices, so the result depends on where that search lands,
 *    not just on the shape.
 *  - Its recursion is an explicit stack pushed as (right, left), so the output points
 *    come out in a specific rotation of the ring rather than sorted by index.
 *  - A final clean-up pass removes points that are nearly collinear with their
 *    neighbours, gated on `dx != 0 && dy != 0` - so it never touches an axis-aligned
 *    run, which is exactly what traced pixel borders are made of.
 *
 * One deliberate omission: OpenCV asserts `dx != 0 || dy != 0` before measuring a slice,
 * and throws if it fails. That is unreachable - a slice is only pushed when its two
 * endpoints are a positive distance apart - so the assert is not reproduced here rather
 * than turned into a JavaScript throw that could never fire.
 */
/**
 * `cv2.approxPolyDP(curve, epsilon, closed)` for integer curves.
 *
 * @throws RangeError for the same epsilon values OpenCV rejects with
 *         `Error::StsOutOfRange` (negative, NaN, or >= 1e30).
 */
export function approxPolyDP(curve, epsilon, closed) {
    if (epsilon < 0 || !(epsilon < 1e30)) {
        throw new RangeError("Epsilon not valid.");
    }
    const count0 = curve.length;
    if (count0 === 0)
        return [];
    const count = count0;
    const srcX = new Int32Array(count);
    const srcY = new Int32Array(count);
    for (let k = 0; k < count; k++) {
        const p = curve[k];
        srcX[k] = p[0];
        srcY[k] = p[1];
    }
    const dstX = new Int32Array(count);
    const dstY = new Int32Array(count);
    let newCount = 0;
    const stack = [];
    const eps = epsilon * epsilon;
    let initIters = 3;
    const slice = { start: 0, end: 0 };
    const rightSlice = { start: 0, end: 0 };
    let startX = -1000000;
    let startY = -1000000;
    let endX = 0;
    let endY = 0;
    let ptX = 0;
    let ptY = 0;
    let pos = 0;
    let isClosed = closed;
    let leEps = false;
    if (!isClosed) {
        rightSlice.start = count;
        endX = srcX[0];
        endY = srcY[0];
        startX = srcX[count - 1];
        startY = srcY[count - 1];
        if (startX !== endX || startY !== endY) {
            slice.start = 0;
            slice.end = count - 1;
            stack.push({ start: slice.start, end: slice.end });
        }
        else {
            isClosed = true;
            initIters = 1;
        }
    }
    if (isClosed) {
        // 1. find approximately the two farthest points of the contour
        rightSlice.start = 0;
        for (let i = 0; i < initIters; i++) {
            let maxDist = 0;
            pos = (pos + rightSlice.start) % count;
            startX = srcX[pos];
            startY = srcY[pos];
            if (++pos >= count)
                pos = 0;
            for (let j = 1; j < count; j++) {
                ptX = srcX[pos];
                ptY = srcY[pos];
                if (++pos >= count)
                    pos = 0;
                const dx = ptX - startX;
                const dy = ptY - startY;
                const dist = dx * dx + dy * dy;
                if (dist > maxDist) {
                    maxDist = dist;
                    rightSlice.start = j;
                }
            }
            leEps = maxDist <= eps;
        }
        // 2. initialise the stack
        if (!leEps) {
            rightSlice.end = slice.start = pos % count;
            slice.end = rightSlice.start = (rightSlice.start + slice.start) % count;
            stack.push({ start: rightSlice.start, end: rightSlice.end });
            stack.push({ start: slice.start, end: slice.end });
        }
        else {
            dstX[newCount] = startX;
            dstY[newCount] = startY;
            newCount++;
        }
    }
    // 3. run the recursive process
    while (stack.length > 0) {
        const cur = stack.pop();
        slice.start = cur.start;
        slice.end = cur.end;
        endX = srcX[slice.end];
        endY = srcY[slice.end];
        pos = slice.start;
        startX = srcX[pos];
        startY = srcY[pos];
        if (++pos >= count)
            pos = 0;
        if (pos !== slice.end) {
            let maxDist = 0;
            const dx = endX - startX;
            const dy = endY - startY;
            while (pos !== slice.end) {
                ptX = srcX[pos];
                ptY = srcY[pos];
                if (++pos >= count)
                    pos = 0;
                const dist = Math.abs((ptY - startY) * dx - (ptX - startX) * dy);
                if (dist > maxDist) {
                    maxDist = dist;
                    rightSlice.start = (pos + count - 1) % count;
                }
            }
            leEps = maxDist * maxDist <= eps * (dx * dx + dy * dy);
        }
        else {
            leEps = true;
            startX = srcX[slice.start];
            startY = srcY[slice.start];
        }
        if (leEps) {
            dstX[newCount] = startX;
            dstY[newCount] = startY;
            newCount++;
        }
        else {
            rightSlice.end = slice.end;
            slice.end = rightSlice.start;
            stack.push({ start: rightSlice.start, end: rightSlice.end });
            stack.push({ start: slice.start, end: slice.end });
        }
    }
    // NOTE: this uses the *possibly rewritten* isClosed, then restores the caller's.
    if (!isClosed) {
        dstX[newCount] = srcX[count - 1];
        dstY[newCount] = srcY[count - 1];
        newCount++;
    }
    // 4. final clean-up: drop points that sit on an [almost] straight line.
    isClosed = closed;
    const total = newCount;
    const openBias = isClosed ? 0 : 1; // `!is_closed` as an int, exactly as the C++ uses it
    pos = isClosed ? total - 1 : 0;
    startX = dstX[pos];
    startY = dstY[pos];
    if (++pos >= total)
        pos = 0;
    let wpos = pos;
    ptX = dstX[pos];
    ptY = dstY[pos];
    if (++pos >= total)
        pos = 0;
    for (let i = openBias; i < total - openBias && newCount > 2; i++) {
        endX = dstX[pos];
        endY = dstY[pos];
        if (++pos >= total)
            pos = 0;
        const dx = endX - startX;
        const dy = endY - startY;
        const dist = Math.abs((ptX - startX) * dy - (ptY - startY) * dx);
        const successiveInnerProduct = (ptX - startX) * (endX - ptX) + (ptY - startY) * (endY - ptY);
        if (dist * dist <= 0.5 * eps * (dx * dx + dy * dy) &&
            dx !== 0 &&
            dy !== 0 &&
            successiveInnerProduct >= 0) {
            newCount--;
            startX = endX;
            startY = endY;
            dstX[wpos] = startX;
            dstY[wpos] = startY;
            if (++wpos >= total)
                wpos = 0;
            ptX = dstX[pos];
            ptY = dstY[pos];
            if (++pos >= total)
                pos = 0;
            i++;
            continue;
        }
        startX = ptX;
        startY = ptY;
        dstX[wpos] = startX;
        dstY[wpos] = startY;
        if (++wpos >= total)
            wpos = 0;
        ptX = endX;
        ptY = endY;
    }
    if (!isClosed) {
        dstX[wpos] = ptX;
        dstY[wpos] = ptY;
    }
    const out = new Array(newCount);
    for (let k = 0; k < newCount; k++)
        out[k] = [dstX[k], dstY[k]];
    return out;
}
//# sourceMappingURL=douglasPeucker.js.map