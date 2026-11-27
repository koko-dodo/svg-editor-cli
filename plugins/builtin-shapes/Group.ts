import { ContainerShape } from "../../src/api";
import type { ShapeStyle } from "../../src/api";

/** The built-in ordinary container. Generic algorithms live in ContainerShape. */
export class Group extends ContainerShape {
  readonly kind = "g";
  readonly ungroupPolicy = "expand" as const;

  constructor(id: string, style: ShapeStyle = {}) { super(id, style); }

  override clone(): Group {
    const copy = new Group(this.id, this.copyStyle());
    for (const child of this.children) copy.addChild(child.clone());
    return copy;
  }
}
