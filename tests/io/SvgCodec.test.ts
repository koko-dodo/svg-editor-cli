import { describe, expect, it } from "vitest";
import { SvgReader } from "../../src/io/SvgReader";
import { SvgWriter } from "../../src/io/SvgWriter";
import { SvgValidation } from "../../src/io/SvgValidation";
import { DocumentViewBuilder } from "../../src/commands/DocumentViewBuilder";
import { ShapeFactory } from "../../src/model/ShapeFactory";
import { SvgDocument } from "../../src/model/SvgDocument";

const wrap = (body: string, attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" ${attrs}>${body}</svg>`;
const rect = '<rect x="0" y="1" width="2" height="3"/>';
const reader = new SvgReader(); const writer = new SvgWriter();
const view = (document: SvgDocument) => DocumentViewBuilder.capture(document);

describe("SVG codec", () => {
  it("round-trips six types, explicit styles, nested order, empty and special text", () => {
    const input = wrap(`<g id="scene" fill="red" stroke-width="2"><g id="inner">
      <rect id="r" x="-1.5" y="2e1" width="3" height="4" fill="none"/>
      <circle id="c" cx="1" cy="2" r="3"/><ellipse id="e" cx="1" cy="2" rx="3" ry="4"/>
      <line id="l" x1="0" y1="1" x2="2" y2="3" stroke="#123456"/>
      <text id="t" x="1" y="2">  &lt;&amp;&gt; &quot;中文&quot;<![CDATA[<raw>]]>&#13;\n end </text>
      <text id="empty" x="0" y="0"/></g></g>`, 'viewBox="0 0 400 300"');
    const first = reader.read(input);
    const saved = writer.write(first.document);
    expect(saved.elements).toBe(8);
    expect(saved.xml).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(saved.xml).not.toContain('fill="black"');
    expect(view(reader.read(saved.xml).document)).toEqual(view(first.document));
    expect(first.warnings).toEqual([]);
  });
  it("reserves all explicit IDs before allocating per-tag IDs", () => {
    const result = reader.read(wrap(`${rect}<g><rect id="rect1" x="1" y="2" width="3" height="4"/><g id="g1"/></g><circle id=" " cx="1" cy="2" r="3"/>`));
    expect(result.warnings.map(w => w.id)).toEqual(["rect2", "g2", "circle1"]);
    expect(result.document.hasShape("rect1")).toBe(true);
  });
  it("allows only the explicit harmless metadata whitelist", () => {
    expect(reader.read(wrap('<g id="a" data-kind="box"/>')).elements).toBe(1);
    expect(() => reader.read(wrap('<g data-arbitrary="x"/>'))).toThrow("unsupported SVG attribute");
  });
  it.each(["transform", "opacity", "font-size", "text-anchor", "onclick", "href", "style", "class", "filter", "xml:base"])("rejects unsupported %s", attribute => {
    expect(() => reader.read(wrap(`<g ${attribute}="x"/>`))).toThrow();
  });
  it.each(['<script/>', '<image/>', '<use/>', '<path/>', '<foreignObject/>', '<g xmlns="urn:evil"/>', '<text x="1" y="2"><tspan>x</tspan></text>', '<rect x="1" y="2" width="3" height="4"><g/></rect>', '<g>unexpected</g>', '<?xml-stylesheet href="evil"?>'])("rejects unsupported content %s", body => {
    expect(() => reader.read(wrap(body))).toThrow();
  });
  it.each(['<g id="a"/><g id="a"/>', '<rect y="1" width="2" height="3"/>', '<circle cx="" cy="1" r="2"/>', '<circle cx="NaN" cy="1" r="2"/>', '<circle cx="Infinity" cy="1" r="2"/>', '<circle cx="1px" cy="1" r="2"/>', '<circle cx="1" cy="1" r="-2"/>', '<g fill="url(https://evil)"/>', '<g fill="url(#gradient)"/>'])("rejects invalid model input %s", body => {
    expect(() => reader.read(wrap(body))).toThrow();
  });
  it.each(['<g>', '<g></rect>', '<g id="a" id="b"/>', '<g id=a/>', '<text x="0" y="0">&unknown;</text>', '<text x="0" y="0">a & b</text>'])("rejects malformed XML %s", body => {
    expect(() => reader.read(wrap(body))).toThrow();
  });
  it("rejects DTDs, external entities and multiple roots", () => {
    expect(() => reader.read('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + wrap(''))).toThrow("DOCTYPE");
    expect(() => reader.read(wrap('') + wrap(''))).toThrow();
  });
  it.each(['viewBox="1 0 400 300"', 'viewBox="0 0 800 600"', 'viewBox="0 0 400"'])("rejects viewBox %s", attrs => {
    expect(() => reader.read(wrap('', attrs))).toThrow();
  });
  it("enforces size, depth and XML character limits", () => {
    expect(() => reader.read(wrap(' '.repeat(SvgValidation.maxBytes)))).toThrow("size limit");
    expect(() => reader.read(wrap('<g>'.repeat(129) + '</g>'.repeat(129)))).toThrow("depth limit");
    expect(() => reader.read(wrap('\0'))).toThrow("XML character");
    expect(() => reader.read(wrap('<text x="0" y="0">&#0;</text>'))).toThrow();
  });
  it("rejects unsafe paints and invalid characters introduced via editing before writing", () => {
    const doc = new SvgDocument(); const factory = new ShapeFactory();
    doc.addShape(factory.create({ type: "text", id: "t", x: 0, y: 0, text: '\0' }));
    expect(() => writer.write(doc)).toThrow("XML character");
    doc.setAttribute("t", "text", "safe"); doc.setAttribute("t", "fill", "url(https://evil)");
    expect(() => writer.write(doc)).toThrow("paint");
  });
});
