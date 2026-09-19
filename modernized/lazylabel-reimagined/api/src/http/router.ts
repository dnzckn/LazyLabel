/**
 * A tiny router, because the API has no runtime dependencies.
 *
 * Patterns use `:name` for one path segment and `*name` for the rest of the path. The rest-segment
 * form is what the annotation routes need: an image key is `sequences/run_4/frame_012.png`, several
 * segments, and it sits in the MIDDLE of the route rather than at the end
 * (`/projects/{id}/images/{imagePath}/annotations`).
 *
 * Every segment is percent-decoded once, here and nowhere else. Decoding twice is how a `%252e%252e`
 * becomes `..` one layer too late to be checked; the blob store refuses traversal regardless, but
 * the two checks should not depend on each other to be correct.
 */

export interface RouteMatch {
  readonly params: Readonly<Record<string, string>>;
}

export interface Route<T> {
  readonly method: string;
  readonly pattern: string;
  readonly handler: T;
}

export function matchRoute(pattern: string, path: string): RouteMatch | null {
  const patternParts = split(pattern);
  const pathParts = split(path);
  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i += 1) {
    const part = patternParts[i]!;

    if (part.startsWith("*")) {
      // The rest pattern takes as few segments as it can while leaving enough for what follows, so
      // the trailing literals of the pattern still have to match.
      const remainingPattern = patternParts.length - i - 1;
      const take = pathParts.length - i - remainingPattern;
      if (take < 1) return null;
      const captured = pathParts.slice(i, i + take);
      if (captured.some((segment) => segment === "")) return null;
      params[part.slice(1)] = captured.map(decodeSegment).join("/");
      // Continue matching the literal tail against the end of the path.
      const tailPattern = patternParts.slice(i + 1);
      const tailPath = pathParts.slice(i + take);
      if (tailPattern.length !== tailPath.length) return null;
      for (let j = 0; j < tailPattern.length; j += 1) {
        const expected = tailPattern[j]!;
        const actual = tailPath[j]!;
        if (expected.startsWith(":")) params[expected.slice(1)] = decodeSegment(actual);
        else if (expected !== actual) return null;
      }
      return { params };
    }

    const actual = pathParts[i];
    if (actual === undefined) return null;
    if (part.startsWith(":")) {
      if (actual === "") return null;
      params[part.slice(1)] = decodeSegment(actual);
    } else if (part !== actual) {
      return null;
    }
  }

  return pathParts.length === patternParts.length ? { params } : null;
}

function split(path: string): string[] {
  return path.replace(/^\/+/, "").replace(/\/+$/, "").split("/");
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    // A malformed escape is left as written rather than guessed at. The blob store then refuses it,
    // which is the right outcome: a path the client could not spell is not a path we should invent.
    return segment;
  }
}
