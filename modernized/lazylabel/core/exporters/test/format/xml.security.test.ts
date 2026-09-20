/**
 * SEC-07: the XML reader cannot be made to expand an entity or fetch a URL.
 *
 * Legacy parses Pascal VOC sidecars with ElementTree on expat 2.5.0. Nested entities crashed the
 * interpreter with a stack overflow (CVE-2024-8176, reproduced during the assessment), and two more
 * parser denial-of-service CVEs apply. The fix recorded there was `defusedxml` with
 * `forbid_dtd=True` — configuring the danger off.
 *
 * This reader designs it out instead: it is a scanner that never resolves entities, so there is
 * nothing to configure and nothing to forget. That is a claim, and claims that are never exercised
 * are how a "safe by construction" parser quietly stops being one — so these are the attacks,
 * written out, run against the real reader.
 *
 * Phase 4's exit criterion 4 names SEC-07. Before this file, it was argued in a comment and tested
 * nowhere.
 */

import { describe, expect, it } from "vitest";

import { MalformedXmlError, readXmlRoot, unescapeXml } from "../../src/format/xml.js";
import { parsePascalVoc } from "../../src/format/pascalVoc.js";

/** The classic expansion bomb. Under a resolving parser this is gigabytes of "lol". */
const BILLION_LAUGHS = `<?xml version="1.0"?>
<!DOCTYPE annotation [
  <!ENTITY lol "lol">
  <!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
  <!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;">
]>
<annotation>
  <object><name>&lol4;</name><bndbox><xmin>1</xmin><ymin>1</ymin><xmax>2</xmax><ymax>2</ymax></bndbox></object>
</annotation>`;

const EXTERNAL_ENTITY = `<?xml version="1.0"?>
<!DOCTYPE annotation [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
<annotation>
  <object><name>&xxe;</name><bndbox><xmin>1</xmin><ymin>1</ymin><xmax>2</xmax><ymax>2</ymax></bndbox></object>
</annotation>`;

describe("SEC-07: entities are never resolved", () => {
  it("does not expand a billion-laughs bomb", () => {
    const started = Date.now();
    const root = readXmlRoot(BILLION_LAUGHS, "annotation");

    // The entity reference survives as literal text. Anything else means something resolved it.
    expect(root).toContain("&lol4;");
    expect(root.length).toBeLessThan(BILLION_LAUGHS.length);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("does not fetch an external entity", () => {
    const root = readXmlRoot(EXTERNAL_ENTITY, "annotation");

    expect(root).toContain("&xxe;");
    expect(root).not.toContain("root:");
  });

  it("leaves an unknown entity alone rather than resolving or erroring", () => {
    // The five standard entities and numeric references are the whole vocabulary. Anything else is
    // text, because a reader that has no way to look an entity up has no way to be tricked.
    expect(unescapeXml("&xxe;")).toBe("&xxe;");
    expect(unescapeXml("&lol4;")).toBe("&lol4;");
  });

  it("still reads a legitimate file that happens to carry a doctype", () => {
    // Refusing every DOCTYPE outright would reject third-party Pascal VOC files the legacy app
    // reads. Ignoring the declarations is what makes both true at once.
    const withDoctype = `<?xml version="1.0"?>
<!DOCTYPE annotation SYSTEM "annotation.dtd">
<annotation>
  <object><name>stop sign</name><bndbox><xmin>1</xmin><ymin>2</ymin><xmax>30</xmax><ymax>40</ymax></bndbox></object>
</annotation>`;

    const result = parsePascalVoc(withDoctype, [100, 100]);

    expect(result.segments).toHaveLength(1);
  });

  it("does not treat a doctype's internal subset as content", () => {
    // The declarations sit between the prolog and the root. A scanner that took the first "<...>"
    // it saw as the root would read the subset as elements.
    const root = readXmlRoot(BILLION_LAUGHS, "annotation");

    expect(root).not.toContain("ENTITY");
  });
});

describe("numeric character references", () => {
  it("resolves the ordinary ones", () => {
    expect(unescapeXml("&#65;&#x42;")).toBe("AB");
  });

  it("refuses a code point that does not exist, rather than throwing something unexpected", () => {
    // 0x110000 is one past the last valid code point, and String.fromCodePoint throws a RangeError
    // on it. A reader whose failure mode for a malformed file is an unrelated built-in error is a
    // reader whose caller cannot tell "bad file" from "bug in the reader" -- and the load chain
    // decides whether to try the next format on exactly that distinction.
    expect(() => unescapeXml("&#1114112;")).toThrow(MalformedXmlError);
    expect(() => unescapeXml("&#x110000;")).toThrow(MalformedXmlError);
  });

  it("refuses a surrogate half, which is not a character either", () => {
    expect(() => unescapeXml("&#xD800;")).toThrow(MalformedXmlError);
  });
});
