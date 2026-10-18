import { SaxesParser } from "saxes";
import { DOMParser } from "@xmldom/xmldom";
import type { Element, Node } from "@xmldom/xmldom";
import { ShapeFactory } from "../model/ShapeFactory";
import type { ShapeDefinition } from "../model/ShapeFactory";
import { ShapeSchema } from "../model/ShapeSchema";
import { Group } from "../model/Group";
import { SvgDocument } from "../model/SvgDocument";
import { SvgValidation as V } from "./SvgValidation";

export interface SvgWarning { readonly code: "assigned-id"; readonly tag: string; readonly id: string }
export interface SvgReadResult { readonly document: SvgDocument; readonly warnings: readonly SvgWarning[]; readonly elements: number }

export class SvgReader {
  read(xml: string): SvgReadResult {
    V.size(xml);
    const validator = new SaxesParser({ xmlns: true });
    let depth = 0; let count = 0;
    validator.on("error", error => { throw new Error(`invalid XML: ${error.message}`); });
    validator.on("doctype", () => { throw new Error("DOCTYPE is not allowed"); });
    validator.on("xmldecl", declaration => {
      if (declaration.version !== "1.0" || (declaration.encoding && declaration.encoding.toUpperCase() !== "UTF-8")) {
        throw new Error("only XML 1.0 UTF-8 is supported");
      }
    });
    validator.on("opentag", () => {
      if (++depth > V.maxDepth + 1) throw new Error("SVG nesting exceeds depth limit");
      if (++count > V.maxElements + 1) throw new Error("SVG exceeds element limit");
    });
    validator.on("closetag", () => { depth--; });
    validator.write(xml).close();
    const dom = new DOMParser({ onError: (_level, message) => { throw new Error(`invalid XML: ${message}`); } }).parseFromString(xml, "application/xml");
    const root = dom.documentElement;
    if (!root || root.localName !== "svg" || root.namespaceURI !== V.namespace) throw new Error("expected SVG root with SVG namespace");
    for (let node = dom.firstChild; node; node = node.nextSibling) {
      if (node === root || node.nodeType === 8 || (node.nodeType === 7 && node.nodeName === "xml") || (node.nodeType === 3 && !node.nodeValue?.trim())) continue;
      throw new Error("unsupported XML document content");
    }
    this.attributes(root, ["width", "height", "viewBox"]);
    const width = V.number(root.getAttribute("width"), "width");
    const height = V.number(root.getAttribute("height"), "height");
    const document = new SvgDocument(width, height);
    if (root.hasAttribute("viewBox")) {
      const box = root.getAttribute("viewBox")!.trim().split(/[\s,]+/).map(part => V.number(part, "viewBox"));
      if (box.length !== 4 || box[0] !== 0 || box[1] !== 0 || box[2] !== width || box[3] !== height) throw new Error("unsupported viewBox: expected 0 0 width height");
    }
    const elements: Element[] = [];
    const used = new Set<string>();
    const visit = (element: Element, depth: number): void => {
      if (depth > V.maxDepth) throw new Error("SVG nesting exceeds depth limit");
      if (elements.length >= V.maxElements) throw new Error("SVG exceeds element limit");
      if (element.namespaceURI !== V.namespace) throw new Error("unsupported SVG namespace");
      const schema = ShapeSchema.forTag(element.localName!);
      this.attributes(element, ["id", ...schema.fields.filter(field => field !== "text"), ...ShapeSchema.styles]);
      elements.push(element);
      const id = element.getAttribute("id");
      if (id?.trim()) {
        if (used.has(id)) throw new Error(`id already exists: ${id}`);
        used.add(id);
      }
      for (const child of this.children(element, schema.tag === "text")) {
        if (schema.tag !== "g") throw new Error(`child elements not allowed in ${schema.tag}`);
        visit(child, depth + 1);
      }
    };
    for (const child of this.children(root, false)) visit(child, 1);
    const ids = new Map<Element, string>();
    const warnings: SvgWarning[] = [];
    const counters = new Map<string, number>();
    for (const element of elements) {
      let id = element.getAttribute("id");
      if (!id?.trim()) {
        const tag = element.localName!;
        let index = counters.get(tag) ?? 0;
        do { id = `${tag}${++index}`; } while (used.has(id));
        counters.set(tag, index); used.add(id);
        warnings.push(Object.freeze({ code: "assigned-id", tag, id }));
      }
      ids.set(element, id);
    }
    const factory = new ShapeFactory();
    const build = (element: Element) => {
      const schema = ShapeSchema.forTag(element.localName!);
      const values: Record<string, string | number> = { type: schema.tag, id: ids.get(element)! };
      for (const name of schema.fields) values[name] = name === "text" ? element.textContent ?? "" : V.number(element.getAttribute(name), name);
      for (const name of ShapeSchema.styles) if (element.hasAttribute(name)) {
        const value = element.getAttribute(name)!;
        if (name === "stroke-width") values[name] = V.number(value, name);
        else { V.paint(value); values[name] = value; }
      }
      // Schema validation establishes the discriminated construction shape.
      const shape = factory.create(values as unknown as ShapeDefinition);
      if (shape instanceof Group) for (const child of this.children(element, false)) shape.addChild(build(child));
      return shape;
    };
    for (const child of this.children(root, false)) document.addShape(build(child));
    return { document, warnings: Object.freeze(warnings), elements: elements.length };
  }

  private attributes(element: Element, allowed: readonly string[]): void {
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes.item(i)!;
      if (attr.namespaceURI === "http://www.w3.org/2000/xmlns/") continue;
      // Plugin markers are harmless metadata in this phase, never executable content.
      if (!attr.namespaceURI && attr.name === "data-kind") continue;
      if (attr.namespaceURI || !allowed.includes(attr.name)) throw new Error(`unsupported SVG attribute: ${attr.name}`);
    }
  }
  private children(element: Element, text: boolean): Element[] {
    const result: Element[] = [];
    for (let node: Node | null = element.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 1) result.push(node as Element);
      else if (node.nodeType === 8) continue;
      else if ((node.nodeType === 3 || node.nodeType === 4) && (text || !node.nodeValue?.trim())) continue;
      else throw new Error(`unsupported content in ${element.localName}`);
    }
    return result;
  }
}
