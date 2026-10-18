import type { ShapeDefinition } from "./ShapeFactory";

/** Shared SVG/model metadata; presentation layouts remain in CLI. */
export class ShapeSchema {
  static readonly entries = Object.freeze([
    { tag: "rect", modelType: "Rectangle", fields: ["x", "y", "width", "height"] },
    { tag: "circle", modelType: "Circle", fields: ["cx", "cy", "r"] },
    { tag: "ellipse", modelType: "Ellipse", fields: ["cx", "cy", "rx", "ry"] },
    { tag: "line", modelType: "Line", fields: ["x1", "y1", "x2", "y2"] },
    { tag: "text", modelType: "TextShape", fields: ["x", "y", "text"] },
    { tag: "g", modelType: "Group", fields: [] },
  ].map(entry => Object.freeze({ ...entry, tag: entry.tag as ShapeDefinition["type"], fields: Object.freeze(entry.fields) })));
  static readonly styles = Object.freeze(["fill", "stroke", "stroke-width"]);
  static forTag(tag: string) {
    const entry = this.entries.find(item => item.tag === tag);
    if (!entry) throw new Error(`unsupported SVG element: ${tag}`);
    return entry;
  }
  static forModel(modelType: string) {
    const entry = this.entries.find(item => item.modelType === modelType);
    if (!entry) throw new Error(`unsupported shape: ${modelType}`);
    return entry;
  }
}
