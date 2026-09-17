/**
 * The slice of XML reading Pascal VOC needs, without an XML parser.
 *
 * This is a deliberate choice, not a shortcut. Section 2 of the brief requires that XML parsing
 * reject document type definitions (SEC-09); a scanner that never resolves entities cannot be made
 * to fetch a URL or expand a billion-laughs bomb, so the class of attack is designed out rather
 * than configured off. Replacing this with a general XML parser reintroduces it.
 *
 * What it must still do faithfully: ElementTree's findall("object") matches DIRECT CHILDREN of the
 * root only, and comments and CDATA are not content. A naive regex over the whole document would
 * load objects that the legacy app ignores.
 */

/** Raised when the bytes are not an XML document this reader can trust. */
export class MalformedXmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedXmlError";
  }
}

/** Remove comments, CDATA sections and processing instructions, which are not element content. */
function stripNonContent(xml: string): string {
  return xml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "");
}

/**
 * Check this really is XML, and return the root element's content with non-content removed.
 *
 * Refuses binary (a NUL byte) and anything whose first non-whitespace character is not "<". Without
 * those checks a JPEG renamed to .xml parses to "no objects", wins the load chain, and shows the
 * user an empty canvas.
 *
 * The root's NAME is not required to match: legacy never checks it, because ElementTree parses the
 * document and runs findall("object") on whatever the root happens to be (file_manager.py:472).
 * Demanding <annotation> would refuse third-party Pascal VOC files that the legacy app reads.
 */
export function readXmlRoot(xml: string, rootTag: string): string {
  if (xml.includes("\0")) throw new MalformedXmlError("this is binary data, not XML");
  const stripped = stripNonContent(xml);
  if (!stripped.trimStart().startsWith("<")) {
    throw new MalformedXmlError("the file does not start with an XML element");
  }

  const named = new RegExp(`<${rootTag}\\b[^>]*>([\\s\\S]*)</${rootTag}>`).exec(stripped);
  if (named) return named[1] ?? "";
  if (new RegExp(`<${rootTag}\\b[^>]*/>`).test(stripped)) return "";

  const anyRoot = /<([A-Za-z_][\w.-]*)\b[^>]*>([\s\S]*)<\/\1\s*>/.exec(stripped);
  if (anyRoot) return anyRoot[2] ?? "";
  throw new MalformedXmlError("no XML element with content; this is not an annotation file");
}

/**
 * The direct children of `content` with the given tag, as their inner XML.
 *
 * Depth is tracked so a nested element of the same name is not mistaken for a sibling, which is
 * what ElementTree's findall does.
 */
export function directChildren(content: string, tag: string): string[] {
  const out: string[] = [];
  const element = /<([A-Za-z_][\w.-]*)\b([^>]*)>|<\/([A-Za-z_][\w.-]*)\s*>/g;
  let depth = 0;
  let start = -1;

  for (let match = element.exec(content); match !== null; match = element.exec(content)) {
    const [text, openTag, attributes, closeTag] = match;
    if (openTag !== undefined) {
      if (attributes?.trimEnd().endsWith("/")) {
        if (depth === 0 && openTag === tag) out.push("");
        continue; // self-closing: never opens a level
      }
      if (depth === 0 && openTag === tag) start = match.index + text.length;
      depth += 1;
    } else if (closeTag !== undefined) {
      depth -= 1;
      if (depth === 0 && closeTag === tag && start >= 0) {
        out.push(content.slice(start, match.index));
        start = -1;
      }
      if (depth < 0) throw new MalformedXmlError("unbalanced XML: a closing tag with nothing open");
    }
  }
  if (depth !== 0) throw new MalformedXmlError("unbalanced XML: an element is never closed");
  return out;
}

/** The text of the first direct child with this tag, or null when absent. */
export function childText(content: string, tag: string): string | null {
  const children = directChildren(content, tag);
  return children.length === 0 ? null : unescapeXml(children[0]!);
}

export function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

export function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
