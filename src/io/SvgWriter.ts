import { DOMImplementation, XMLSerializer } from "@xmldom/xmldom";
import { Group } from "../model/Group";
import type { Shape } from "../model/Shape";
import type { SvgDocument } from "../model/SvgDocument";
import { ShapeSchema } from "../model/ShapeSchema";
import { SvgValidation as V } from "./SvgValidation";

export class SvgWriter {
  write(document: SvgDocument): { readonly xml: string; readonly elements: number } {
    const dom = new DOMImplementation().createDocument(V.namespace, "svg", null);
    const root = dom.documentElement!;
    root.setAttribute("width", String(document.width)); root.setAttribute("height", String(document.height));
    root.setAttribute("viewBox", `0 0 ${document.width} ${document.height}`);
    let elements = 0;
    const build = (shape: Shape, depth: number) => {
      if (depth > V.maxDepth || ++elements > V.maxElements) throw new Error("SVG exceeds structure limits");
      const schema = ShapeSchema.forModel(shape.constructor.name);
      const element = dom.createElementNS(V.namespace, schema.tag);
      element.setAttribute("id", shape.id);
      for (const field of schema.fields) {
        const value = Reflect.get(shape, field) as string | number;
        if (field === "text") element.appendChild(dom.createTextNode(String(value)));
        else element.setAttribute(field, String(value));
      }
      for (const name of ShapeSchema.styles) {
        const value = Reflect.get(shape, name === "stroke-width" ? "strokeWidth" : name) as string | number | undefined;
        if (value !== undefined) {
          if (name !== "stroke-width") V.paint(String(value));
          element.setAttribute(name, String(value));
        }
      }
      if (shape instanceof Group) for (const child of shape.children) element.appendChild(build(child, depth + 1));
      return element;
    };
    for (const shape of document.getRootSnapshots()) root.appendChild(build(shape, 1));
    // Preserve CR and attribute whitespace through XML normalization on readback.
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(dom).replace(/\r/g, "&#13;");
    V.size(xml);
    return { xml, elements };
  }
}
