import { Shape } from "./Shape";
import type { ShapeStyle } from "./Shape";

export class Ellipse extends Shape {
  private _cx: number;
  private _cy: number;
  private _rx: number;
  private _ry: number;

  constructor(id: string, cx: number, cy: number, rx: number, ry: number, style: ShapeStyle = {}) {
    super(id, style);
    this._cx = this.finite(cx, "cx");
    this._cy = this.finite(cy, "cy");
    this._rx = this.nonNegative(rx, "rx");
    this._ry = this.nonNegative(ry, "ry");
  }

  get cx(): number { return this._cx; }
  get cy(): number { return this._cy; }
  get rx(): number { return this._rx; }
  get ry(): number { return this._ry; }

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
    const rx = this.finite(this._rx * factor, "rx");
    const ry = this.finite(this._ry * factor, "ry");
    this._cx = cx;
    this._cy = cy;
    this._rx = rx;
    this._ry = ry;
  }

  protected override setOwnAttribute(name: string, value: string | number): void {
    if (name === "cx") { this._cx = this.numeric(value, name); return; }
    if (name === "cy") { this._cy = this.numeric(value, name); return; }
    if (name === "rx") { this._rx = this.nonNegative(this.numeric(value, name), name); return; }
    if (name === "ry") { this._ry = this.nonNegative(this.numeric(value, name), name); return; }
    throw new Error(`unknown attribute: ${name}`);
  }

  override clone(): Ellipse {
    return new Ellipse(this.id, this._cx, this._cy, this._rx, this._ry, this.copyStyle());
  }
}
