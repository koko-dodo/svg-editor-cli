import { SaxesParser } from "saxes";
import { DOMParser } from "@xmldom/xmldom";
import type { Element, Node } from "@xmldom/xmldom";
import type { Shape, ShapeProvider, SvgElementData } from "../api";
import type { ExtensionRegistry } from "../extensions/ExtensionRegistry";
import { captureView } from "../model/DocumentView";
import { validateForest } from "../model/ShapeTree";
import type { SvgDocument } from "../model/SvgDocument";
import { SvgValidation as V } from "./SvgValidation";

export interface SvgWarning { readonly code: "assigned-id"; readonly tag: string; readonly id: string }
export interface SvgReadResult { readonly document: SvgDocument; readonly warnings: readonly SvgWarning[]; readonly elements: number }

export class SvgReader {
  constructor(private readonly registry: ExtensionRegistry, private readonly documentFactory: (width: number, height: number) => SvgDocument) {}
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
    this.attributes(root, ["width", "height", "viewBox", "version"]);
    if (root.hasAttribute("version") && !["1.0", "1.1", "2.0"].includes(root.getAttribute("version")!)) {
      throw new Error("unsupported SVG version");
    }
    const width = V.number(root.getAttribute("width"), "width");
    const height = V.number(root.getAttribute("height"), "height");
    const document = this.documentFactory(width, height);
    if (root.hasAttribute("viewBox")) {
      const box = root.getAttribute("viewBox")!.trim().split(/[\s,]+/).map(part => V.number(part, "viewBox"));
      if (box.length !== 4 || box[0] !== 0 || box[1] !== 0 || box[2] !== width || box[3] !== height) throw new Error("unsupported viewBox: expected 0 0 width height");
    }
    const elements: Element[] = [];
    const used = new Set<string>();
    const providers = new Map<Element, ShapeProvider>();
    const data = (element: Element): SvgElementData => {
      const attributes: Record<string, string> = {};
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes.item(i)!;
        if (attr.namespaceURI === "http://www.w3.org/2000/xmlns/") continue;
        if (attr.namespaceURI) throw new Error(`unsupported SVG attribute: ${attr.name}`);
        Object.defineProperty(attributes, attr.name, { value: attr.value, enumerable: true });
      }
      let text = "";
      for (let child = element.firstChild; child; child = child.nextSibling) if (child.nodeType === 3 || child.nodeType === 4) text += child.nodeValue ?? "";
      return Object.freeze({ namespace: element.namespaceURI ?? "", localName: element.localName!, attributes: Object.freeze(attributes), text });
    };
    const visit = (element: Element, depth: number): void => {
      if (depth > V.maxDepth) throw new Error("SVG nesting exceeds depth limit");
      if (elements.length >= V.maxElements) throw new Error("SVG exceeds element limit");
      const raw = data(element);
      const provider = this.registry.shapeForSvg({ namespace: raw.namespace, localName: raw.localName,
        ...(raw.attributes["data-kind"] === undefined ? {} : { dataKind: raw.attributes["data-kind"] }) });
      if (!provider) {
        if (element.namespaceURI !== V.namespace) throw new Error("unsupported SVG namespace");
        throw new Error(`unsupported SVG element: ${element.localName}`);
      }
      providers.set(element, provider);
      const policy = provider.readPolicy;
      if (policy) this.attributes(element, policy.attributes);
      elements.push(element);
      const id = element.getAttribute("id");
      if (id?.trim()) {
        if (used.has(id)) throw new Error(`id already exists: ${id}`);
        used.add(id);
      }
      const children = this.children(element, policy?.text ?? true);
      for (const child of children) {
        if (policy && !policy.children) throw new Error(`child elements not allowed in ${element.localName}`);
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
    const build = (element: Element): Shape => {
      const provider = providers.get(element)!;
      const children = this.children(element, provider.readPolicy?.text ?? true).map(build);
      const expectedChildren = JSON.stringify(captureView(0, 0, children).roots);
      const shape = provider.read(data(element), ids.get(element)!, Object.freeze(children), this.registry.shapeServices());
      if (shape.id !== ids.get(element) || shape.kind !== provider.kind) throw new Error("provider returned wrong shape identity");
      const actual = shape.asContainer()?.children ?? [];
      validateForest([shape]);
      if (JSON.stringify(captureView(0, 0, actual).roots) !== expectedChildren) throw new Error("provider changed read children");
      return shape;
    };
    for (const child of this.children(root, false)) document.addShape(build(child));
    document.clone().validateComplete();
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
