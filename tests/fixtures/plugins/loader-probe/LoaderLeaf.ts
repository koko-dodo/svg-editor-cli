import { Shape } from "../../../../src/api";
import type { Attributes } from "../../../../src/api";

export class LoaderLeaf extends Shape {
  readonly kind = "loader-leaf";
  constructor(id: string, private value: number) { super(id); this.finite(value, "value"); }
  override attributes(): Attributes { return Object.freeze({ ...super.attributes(), value: this.value }); }
  move(dx: number, dy: number): void { this.value = this.finite(this.value + dx + dy, "value"); }
  scale(factor: number): void { this.value = this.finite(this.value * this.scaleFactor(factor), "value"); }
  protected setOwnAttribute(name: string, value: string | number): void {
    if (name !== "value") throw new Error(`unknown attribute: ${name}`);
    this.value = this.numeric(value, name);
  }
  clone(): LoaderLeaf {
    const copy = new LoaderLeaf(this.id, this.value);
    for (const [name, value] of Object.entries(super.attributes())) copy.setAttribute(name, value);
    return copy;
  }
}
