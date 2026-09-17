import { FORMAT_SUFFIX, type AnnotationFormat } from "./types.js";

/**
 * Where a format's file sits for a given image.
 *
 * Mirrors `os.path.splitext(image_path)[0] + suffix`: only the LAST extension is stripped, so
 * "a/b.tar.png" becomes "a/b.tar.txt" and an extensionless "a/b" becomes "a/b.txt". A dot in a
 * directory name never counts, and a leading dot on the file name is part of the name, not an
 * extension, which is what Python's splitext does.
 */
export function outputPathFor(imagePath: string, format: AnnotationFormat): string {
  return stripExtension(imagePath) + FORMAT_SUFFIX[format];
}

export function stripExtension(path: string): string {
  const lastSep = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const name = path.slice(lastSep + 1);
  // Python's splitext keeps leading dots: ".bashrc" has no extension.
  const firstNonDot = name.search(/[^.]/);
  const dot = firstNonDot < 0 ? -1 : name.lastIndexOf(".");
  if (dot <= firstNonDot) return path;
  return path.slice(0, lastSep + 1) + name.slice(0, dot);
}
