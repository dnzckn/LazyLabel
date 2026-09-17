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
    constructor(message) {
        super(message);
        this.name = "MalformedXmlError";
    }
}
/** Remove comments, CDATA sections and processing instructions, which are not element content. */
function stripNonContent(xml) {
    return xml
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
        .replace(/<\?[\s\S]*?\?>/g, "");
}
/**
 * Check this really is XML, and return its content with non-content removed.
 *
 * Refuses binary (a NUL byte), anything whose first non-whitespace character is not "<", and any
 * document without the expected root element. Without these a JPEG or a truncated file parses to
 * "no objects", wins the load chain, and shows the user an empty canvas.
 */
export function readXmlRoot(xml, rootTag) {
    if (xml.includes("\0"))
        throw new MalformedXmlError("this is binary data, not XML");
    const stripped = stripNonContent(xml);
    const firstContent = stripped.trimStart();
    if (!firstContent.startsWith("<")) {
        throw new MalformedXmlError("the file does not start with an XML element");
    }
    const root = new RegExp(`<${rootTag}\\b[^>]*>([\\s\\S]*)</${rootTag}>`).exec(stripped);
    if (!root) {
        const selfClosing = new RegExp(`<${rootTag}\\b[^>]*/>`).test(stripped);
        if (selfClosing)
            return "";
        throw new MalformedXmlError(`no <${rootTag}> element; this is not a LazyLabel annotation file`);
    }
    return root[1] ?? "";
}
/**
 * The direct children of `content` with the given tag, as their inner XML.
 *
 * Depth is tracked so a nested element of the same name is not mistaken for a sibling, which is
 * what ElementTree's findall does.
 */
export function directChildren(content, tag) {
    const out = [];
    const element = /<([A-Za-z_][\w.-]*)\b([^>]*)>|<\/([A-Za-z_][\w.-]*)\s*>/g;
    let depth = 0;
    let start = -1;
    for (let match = element.exec(content); match !== null; match = element.exec(content)) {
        const [text, openTag, attributes, closeTag] = match;
        if (openTag !== undefined) {
            if (attributes?.trimEnd().endsWith("/")) {
                if (depth === 0 && openTag === tag)
                    out.push("");
                continue; // self-closing: never opens a level
            }
            if (depth === 0 && openTag === tag)
                start = match.index + text.length;
            depth += 1;
        }
        else if (closeTag !== undefined) {
            depth -= 1;
            if (depth === 0 && closeTag === tag && start >= 0) {
                out.push(content.slice(start, match.index));
                start = -1;
            }
            if (depth < 0)
                throw new MalformedXmlError("unbalanced XML: a closing tag with nothing open");
        }
    }
    if (depth !== 0)
        throw new MalformedXmlError("unbalanced XML: an element is never closed");
    return out;
}
/** The text of the first direct child with this tag, or null when absent. */
export function childText(content, tag) {
    const children = directChildren(content, tag);
    return children.length === 0 ? null : unescapeXml(children[0]);
}
export function unescapeXml(text) {
    return text
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&amp;/g, "&");
}
export function escapeXml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
//# sourceMappingURL=xml.js.map