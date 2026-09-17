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
export declare class MalformedXmlError extends Error {
    constructor(message: string);
}
/**
 * Check this really is XML, and return its content with non-content removed.
 *
 * Refuses binary (a NUL byte), anything whose first non-whitespace character is not "<", and any
 * document without the expected root element. Without these a JPEG or a truncated file parses to
 * "no objects", wins the load chain, and shows the user an empty canvas.
 */
export declare function readXmlRoot(xml: string, rootTag: string): string;
/**
 * The direct children of `content` with the given tag, as their inner XML.
 *
 * Depth is tracked so a nested element of the same name is not mistaken for a sibling, which is
 * what ElementTree's findall does.
 */
export declare function directChildren(content: string, tag: string): string[];
/** The text of the first direct child with this tag, or null when absent. */
export declare function childText(content: string, tag: string): string | null;
export declare function unescapeXml(text: string): string;
export declare function escapeXml(text: string): string;
//# sourceMappingURL=xml.d.ts.map