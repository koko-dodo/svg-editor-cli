import { DOMImplementation, XMLSerializer } from "@xmldom/xmldom";
import type { ShapeView } from "../api";
import type { SvgDocument } from "../model/SvgDocument";
import type { ExtensionRegistry } from "../extensions/ExtensionRegistry";
import { SvgValidation as V } from "./SvgValidation";

export class SvgWriter {
  constructor(private readonly registry: ExtensionRegistry) {}
  write(document: SvgDocument): { readonly xml: string; readonly elements: number } {
    const dom = new DOMImplementation().createDocument(V.namespace, "svg", null);
    const root = dom.documentElement!;
    root.setAttribute("width", String(document.width)); root.setAttribute("height", String(document.height));
    root.setAttribute("viewBox", `0 0 ${document.width} ${document.height}`);
    let elements = 0;
    const build = (shape: ShapeView) => {
      elements++;
      const provider = this.registry.shape(shape.kind);
      if (!provider) throw new Error(`unsupported shape: ${shape.kind}`);
      const data = provider.write(shape);
      const selected = this.registry.shapeForSvg({ namespace: data.namespace, localName: data.localName,
        ...(data.attributes["data-kind"] === undefined ? {} : { dataKind: data.attributes["data-kind"] }) });
      if (selected?.kind !== shape.kind || data.attributes.id !== shape.id) throw new Error("provider changed write identity");
      const element = dom.createElementNS(data.namespace, data.localName);
      for (const [name, value] of Object.entries(data.attributes)) element.setAttribute(name, value);
      if (data.text) element.appendChild(dom.createTextNode(data.text));
      for (const child of shape.children) element.appendChild(build(child));
      return element;
    };
    for (const shape of document.view().roots) root.appendChild(build(shape));
    // Preserve CR and attribute whitespace through XML normalization on readback.
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(dom).replace(/\r/g, "&#13;");
    V.characters(xml);
    return { xml, elements };
  }
}
