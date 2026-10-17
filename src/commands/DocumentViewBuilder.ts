import { Group } from "../model/Group";
import type { Shape } from "../model/Shape";
import type { SvgDocument } from "../model/SvgDocument";

export interface ShapeView {
  readonly id: string;
  /** Concrete model class name; not a CLI label or SVG tag. */
  readonly type: string;
  readonly parentId: string | null;
  readonly attributes: Readonly<Record<string, string | number>>;
  readonly children: readonly ShapeView[];
}

export interface DocumentView {
  readonly width: number;
  readonly height: number;
  readonly roots: readonly ShapeView[];
}

/** Presentation-neutral, immutable values for the current built-in model API. */
export class DocumentViewBuilder {
  static capture(document: SvgDocument): DocumentView {
    return Object.freeze({
      width: document.width,
      height: document.height,
      roots: Object.freeze(document.getRootSnapshots().map(shape => this.shape(shape, null))),
    });
  }

  private static shape(shape: Shape, parentId: string | null): ShapeView {
    const attributes: Record<string, string | number> = {};
    // Read only the public scalar getters, never private fields. This common
    // attribute vocabulary avoids dispatching on individual leaf types.
    const keys = [
      "fill", "stroke", "strokeWidth", "x", "y", "width", "height",
      "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "text",
    ];
    for (const key of keys) {
      if (!(key in shape)) continue;
      const value: unknown = Reflect.get(shape, key);
      if (typeof value === "string" || typeof value === "number") {
        attributes[key === "strokeWidth" ? "stroke-width" : key] = value;
      }
    }
    return Object.freeze({
      id: shape.id,
      type: shape.constructor.name,
      parentId,
      attributes: Object.freeze(attributes),
      children: Object.freeze(shape instanceof Group
        ? shape.children.map(child => this.shape(child, shape.id)) : []),
    });
  }
}
