import { Shape } from "./Shape";
import type { ShapeStyle } from "./Shape";

export class Circle extends Shape {
  private _cx: number;
  private _cy: number;
  private _r: number;

  constructor(id: string, cx: number, cy: number, r: number, style: ShapeStyle = {}) {
    super(id, style);
    this._cx = this.finite(cx, "cx");
    this._cy = this.finite(cy, "cy");
    this._r = this.nonNegative(r, "r");
  }

  get cx(): number { return this._cx; }
  get cy(): number { return this._cy; }
  get r(): number { return this._r; }

  override move(dx: number, dy: number): void {
    this.finite(dx, "dx");
    this.finite(dy, "dy");
    const cx = this.finite(this._cx + dx, "cx");
    const cy = this.finite(this._cy + dy, "cy");
    this._cx = cx;
    this._cy = cy;
  }

  override scale(factor: number): void {
    this.scaleFactor(factor);
    const cx = this.finite(this._cx * factor, "cx");
    const cy = this.finite(this._cy * factor, "cy");
    const r = this.finite(this._r * factor, "r");
    this._cx = cx;
    this._cy = cy;
    this._r = r;
  }

  protected override setOwnAttribute(name: string, value: string | number): void {
    if (name === "cx") { this._cx = this.numeric(value, name); return; }
    if (name === "cy") { this._cy = this.numeric(value, name); return; }
    if (name === "r") { this._r = this.nonNegative(this.numeric(value, name), name); return; }
    throw new Error(`unknown attribute: ${name}`);
  }

  override clone(): Circle {
    return new Circle(this.id, this._cx, this._cy, this._r, this.copyStyle());
  }
}
