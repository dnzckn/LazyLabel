import { type AnnotationFormat } from "./types.js";
/**
 * Where a format's file sits for a given image.
 *
 * Mirrors `os.path.splitext(image_path)[0] + suffix`: only the LAST extension is stripped, so
 * "a/b.tar.png" becomes "a/b.tar.txt" and an extensionless "a/b" becomes "a/b.txt". A dot in a
 * directory name never counts, and a leading dot on the file name is part of the name, not an
 * extension, which is what Python's splitext does.
 */
export declare function outputPathFor(imagePath: string, format: AnnotationFormat): string;
export declare function stripExtension(path: string): string;
//# sourceMappingURL=paths.d.ts.map