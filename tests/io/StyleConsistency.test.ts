import { describe, expect, it } from "vitest";
import { ShapeFactory } from "../../src/model/ShapeFactory";
import type { ShapeDefinition } from "../../src/model/ShapeFactory";
import { SvgDocument } from "../../src/model/SvgDocument";
import { SvgReader } from "../../src/io/SvgReader";
import { SvgWriter } from "../../src/io/SvgWriter";
import { SvgValidation } from "../../src/io/SvgValidation";
import { Group } from "../../src/model/Group";
import { Editor } from "../../src/services/Editor";
import { CommandCatalog } from "../../src/cli/CommandCatalog";
import { Parser } from "../../src/cli/Parser";
import { Dispatcher } from "../../src/cli/Dispatcher";

const definitions: ShapeDefinition[] = [
  { type: "rect", id: "r", x: 1, y: 2, width: 3, height: 4 },
  { type: "circle", id: "c", cx: 1, cy: 2, r: 3 },
  { type: "ellipse", id: "e", cx: 1, cy: 2, rx: 3, ry: 4 },
  { type: "line", id: "l", x1: 1, y1: 2, x2: 3, y2: 4 },
  { type: "text", id: "t", x: 1, y: 2, text: "hello" },
  { type: "g", id: "g" },
];
const supported = ["red", "RebeccaPurple", "none", "transparent", "currentColor", "inherit", "initial", "unset",
  "#abc", "#abcd", "#aabbcc", "#aabbccdd", " rgb(1, 2, 3) ", "rgba(10%,20%,30%,.5)",
  "RGB(1 2 3 / 25%)", "hsl(120deg 50% 50%)", "hsla(.5turn, 20%, 30%, .4)", "hsl(3.14rad 50% 50% / 1)", "hsl(100grad 20% 30%)"];
const rejected = ["", " ", "not-a-color", "notacolor", "#12", "#12345", "#1234567", "#ggg",
  "rgb()", "rgb(1,2)", "rgb(1,,2)", "rgb(1,2,3,)", "rgb(1,2%,3)", "rgb(1 2 3 /)", "rgb(1e999 2 3)",
  "hsl(120 50 50)", "hsl(NaN 50% 50%)", "url(#paint)", "url(https://example.invalid/a)",
  "var(--color)", "red;stroke:blue", "red\0", "red\f", String.raw`\72 ed`];
const wrap = (body: string, attrs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" ${attrs}>${body}</svg>`;

describe("shared style contract", () => {
  it.each(supported)("preserves %s through factory, set, writer and reader for all six types", paint => {
    const doc = new SvgDocument(); const factory = new ShapeFactory();
    for (const definition of definitions) {
      const shape = factory.create({ ...definition, fill: paint });
      shape.setAttribute("stroke", paint); shape.setAttribute("stroke-width", "2.5");
      doc.addShape(shape);
    }
    const saved = new SvgWriter().write(doc);
    const restored = new SvgReader().read(saved.xml).document;
    for (const definition of definitions) {
      const shape = restored.getShapeSnapshot(definition.id);
      expect([shape.fill, shape.stroke, shape.strokeWidth]).toEqual([paint, paint, 2.5]);
      expect(shape.constructor).toBe(factory.create(definition).constructor);
    }
  });
  it.each(rejected)("rejects %j at construction, editing and import without partial changes", paint => {
    const factory = new ShapeFactory();
    for (const definition of definitions) {
      expect(() => factory.create({ ...definition, fill: paint })).toThrow("paint");
      const shape = factory.create({ ...definition, fill: "red", stroke: "blue" });
      expect(() => shape.setAttribute("fill", paint)).toThrow("paint");
      expect(() => shape.setAttribute("stroke", paint)).toThrow("paint");
      expect([shape.fill, shape.stroke]).toEqual(["red", "blue"]);
    }
    expect(() => new SvgReader().read(wrap(`<g id="g" fill="${paint}"/>`))).toThrow();
  });
  it("preserves CLI document, redo and barriers after rejected style edits", () => {
    const e = new Editor(); const catalog = new CommandCatalog();
    const parser = new Parser(catalog); const dispatcher = new Dispatcher(e, catalog);
    const run = (line: string) => dispatcher.execute(parser.parse(line)!);
    run("init");
    expect(() => run('create g bad in missing')).toThrow("no such container: missing");
    expect(() => run('create rect bad 0 0 1 1 "url(#x)"')).toThrow("paint");
    expect(e.getStatus().isBlocked).toBe(true);
    run('create rect r 0 0 1 1 "hsl(120deg 50% 50%)"'); run('move r 1 2'); run('undo');
    const before = { tree: e.tree(), status: e.getStatus() };
    expect(() => run('set r fill "url(https://example.invalid/x)"')).toThrow("paint");
    expect({ tree: e.tree(), status: e.getStatus() }).toEqual(before);
    run('redo'); expect(e.show('r').attributes.x).toBe(1);
    expect(() => run('addto missing r')).toThrow("no such shape: missing");
    expect(() => run('create g new in missing')).toThrow("no such container: missing");
    expect(() => run('addto r r')).toThrow("not a container: r");
  });
});

describe("SVG boundary consistency", () => {
  it.each(["1.0", "1.1", "2.0"])("accepts harmless root version %s without retaining metadata", version => {
    const result = new SvgReader().read(wrap('<g id="g"/>', `version="${version}"`));
    expect(result.document.hasShape("g")).toBe(true);
    expect(new SvgWriter().write(result.document).xml).not.toMatch(/<svg\b[^>]*\bversion=/);
  });
  it.each(['version="unknown"', 'opacity=".5"', 'transform="scale(2)"', 'font-size="12"', 'onload="x"', 'href="https://example.invalid"', 'unknown="x"'])("rejects root attribute %s", attrs => {
    expect(() => new SvgReader().read(wrap('', attrs))).toThrow();
  });
  it("does not expand the element whitelist or accept child version metadata", () => {
    for (const body of ['<path/>', '<image href="https://example.invalid"/>', '<g version="1.1"/>']) {
      expect(() => new SvgReader().read(wrap(body))).toThrow();
    }
  });
  it("exports large edited text while retaining the independent import size limit", () => {
    const doc = new SvgDocument();
    doc.addShape(new ShapeFactory().create({ type: "text", id: "t", x: 0, y: 0, text: "a".repeat(SvgValidation.maxBytes) }));
    const saved = new SvgWriter().write(doc);
    expect(saved.xml).toContain("a".repeat(SvgValidation.maxBytes));
    expect(() => new SvgReader().read(saved.xml)).toThrow("size limit");
  });
  it("exports beyond the import depth limit", () => {
    const root = new Group("g0"); let parent = root;
    for (let i = 1; i <= SvgValidation.maxDepth; i++) { const child = new Group(`g${i}`); parent.addChild(child); parent = child; }
    const doc = new SvgDocument(); doc.addShape(root);
    const saved = new SvgWriter().write(doc);
    expect(saved.elements).toBe(SvgValidation.maxDepth + 1);
    expect(() => new SvgReader().read(saved.xml)).toThrow("depth limit");
  });
  it("exports beyond the import element limit", () => {
    const root = new Group("root");
    for (let i = 0; i < SvgValidation.maxElements; i++) root.addChild(new Group(`g${i}`));
    const doc = new SvgDocument(); doc.addShape(root);
    const saved = new SvgWriter().write(doc);
    expect(saved.elements).toBe(SvgValidation.maxElements + 1);
    expect(() => new SvgReader().read(saved.xml)).toThrow("element limit");
  });
});
