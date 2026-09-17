/**
 * Shared object enumeration for the instance-aware writers.
 *
 * Ported from iter_object_contours and contour_to_polygon
 * (legacy/lazylabel/src/lazylabel/core/exporters/__init__.py:114-156).
 */
import { findExternalContours } from "../geometry/contours.js";
/**
 * Every object to write, in file order.
 *
 * With instances present each segment contributes its own contours, so same-class objects that
 * touch stay separate. With none, the merged per-class channels are contoured instead, which fuses
 * touching same-class objects and orders output by ascending class instead of by segment. An EMPTY
 * instances array selects that fallback, which happens in production when a segment's mask does not
 * match the image size (RULE-005).
 */
export function* iterObjectContours(ctx) {
    if (ctx.instances.length > 0) {
        for (const instance of ctx.instances) {
            yield { channel: instance.channel, contour: instance.contour };
        }
        return;
    }
    const { height, width, data } = ctx.maskTensor;
    const channels = ctx.classOrder.length;
    for (let channel = 0; channel < channels; channel += 1) {
        const single = new Uint8Array(height * width);
        let any = false;
        for (let pixel = 0; pixel < height * width; pixel += 1) {
            if (data[pixel * channels + channel]) {
                single[pixel] = 1;
                any = true;
            }
        }
        if (!any)
            continue;
        for (const contour of findExternalContours({ height, width, data: single })) {
            yield { channel, contour };
        }
    }
}
/**
 * Flatten a contour to [x1, y1, x2, y2, ...] pixel coordinates.
 *
 * One-pixel-wide objects collapse to a one- or two-point contour, which is not a polygon. The
 * points are repeated into a closed ring that rasterizes back to exactly the same pixels: a
 * doubled point for a single pixel, a there-and-back pair for a line. Using the bounding box
 * instead would fill the whole square for a diagonal.
 */
export function contourToPolygon(contour) {
    if (contour.length >= 3) {
        return contour.flatMap(([x, y]) => [Math.trunc(x), Math.trunc(y)]);
    }
    if (contour.length === 2) {
        const [[x1, y1], [x2, y2]] = contour;
        return [x1, y1, x2, y2, x2, y2, x1, y1].map(Math.trunc);
    }
    const [x, y] = contour[0] ?? [0, 0];
    return [Math.trunc(x), Math.trunc(y), Math.trunc(x), Math.trunc(y),
        Math.trunc(x), Math.trunc(y), Math.trunc(x), Math.trunc(y)];
}
//# sourceMappingURL=objects.js.map