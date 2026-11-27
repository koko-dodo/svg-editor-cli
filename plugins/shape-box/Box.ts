import { ContainerShape } from "../../src/api";
import type { DocumentQuery } from "../../src/api";

/** Geometry lives exclusively in descendants, including nested composites. */
export class Box extends ContainerShape {
  readonly kind = "box";
  readonly ungroupPolicy = "reject-composite" as const;
  override validate(query: DocumentQuery): void {
    for (const [suffix, kind] of [["rect", "rect"], ["label", "text"]] as const) {
      const part = query.find(`${this.id}-${suffix}`);
      if (part?.kind !== kind || part.parentId !== this.id) throw new Error(`invalid box parts: ${this.id}`);
    }
  }
  override clone(): Box {
    const copy = new Box(this.id, this.copyStyle());
    for (const child of this.children) copy.addChild(child.clone());
    return copy;
  }
}
