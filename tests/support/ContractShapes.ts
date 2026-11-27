// A stand-alone test plugin: no imports from internal model/application modules.
import { Shape, ContainerShape } from "../../src/api";
import type { Attributes, DocumentQuery } from "../../src/api";

export class ProbeLeaf extends Shape {
  readonly kind = "probe-leaf";
  constructor(id: string, private value = 1) { super(id); }
  override attributes(): Attributes { return Object.freeze({ ...super.attributes(), value: this.value }); }
  override move(dx: number, dy: number): void { this.value = this.finite(this.value + dx + dy, "value"); }
  override scale(factor: number): void { this.value = this.finite(this.value * this.scaleFactor(factor), "value"); }
  protected override setOwnAttribute(name: string, value: string | number): void {
    if (name !== "value") throw new Error(`unknown attribute: ${name}`);
    this.value = this.numeric(value, name);
  }
  override clone(): ProbeLeaf {
    const copy = new ProbeLeaf(this.id, this.value);
    for (const [name, value] of Object.entries(super.attributes())) copy.setAttribute(name, value);
    return copy;
  }
}

/** Generic required-parts test double, deliberately not a Group subclass. */
export class RequiredPartsContainer extends ContainerShape {
  readonly kind = "required-parts";
  readonly ungroupPolicy = "reject-composite" as const;
  override validate(query: DocumentQuery): void {
    const part = query.find(`${this.id}-part`);
    if (part?.kind !== "probe-leaf" || part.parentId !== this.id) throw new Error("required part is invalid");
  }
  override clone(): RequiredPartsContainer {
    const copy = new RequiredPartsContainer(this.id, this.copyStyle());
    for (const child of this.children) copy.addChild(child.clone());
    return copy;
  }
}

export function composite(id = "compound"): RequiredPartsContainer {
  const node = new RequiredPartsContainer(id);
  node.addChild(new ProbeLeaf(`${id}-part`));
  return node;
}
