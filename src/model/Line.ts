import { Shape } from "./Shape";
import type { ShapeStyle } from "./Shape";

export class Line extends Shape {
  private _x1: number;
  private _y1: number;
  private _x2: number;
  private _y2: number;

  constructor(id: string, x1: number, y1: number, x2: number, y2: number, style: ShapeStyle = {}) {
    super(id, style);
    this._x1 = this.finite(x1, "x1");
    this._y1 = this.finite(y1, "y1");
    this._x2 = this.finite(x2, "x2");
    this._y2 = this.finite(y2, "y2");
  }

  get x1(): number { return this._x1; }
  get y1(): number { return this._y1; }
  get x2(): number { return this._x2; }
  get y2(): number { return this._y2; }

  override move(dx: number, dy: number): void {
    this.finite(dx, "dx");
    this.finite(dy, "dy");
    const x1 = this.finite(this._x1 + dx, "x1");
    const y1 = this.finite(this._y1 + dy, "y1");
    const x2 = this.finite(this._x2 + dx, "x2");
    const y2 = this.finite(this._y2 + dy, "y2");
    this._x1 = x1;
    this._y1 = y1;
    this._x2 = x2;
    this._y2 = y2;
  }

  override scale(factor: number): void {
    this.scaleFactor(factor);
    const x1 = this.finite(this._x1 * factor, "x1");
    const y1 = this.finite(this._y1 * factor, "y1");
    const x2 = this.finite(this._x2 * factor, "x2");
    const y2 = this.finite(this._y2 * factor, "y2");
    this._x1 = x1;
    this._y1 = y1;
    this._x2 = x2;
    this._y2 = y2;
  }

  protected override setOwnAttribute(name: string, value: string | number): void {
    if (name === "x1") { this._x1 = this.numeric(value, name); return; }
    if (name === "y1") { this._y1 = this.numeric(value, name); return; }
    if (name === "x2") { this._x2 = this.numeric(value, name); return; }
    if (name === "y2") { this._y2 = this.numeric(value, name); return; }
    throw new Error(`unknown attribute: ${name}`);
  }

  override clone(): Line {
    return new Line(this.id, this._x1, this._y1, this._x2, this._y2, this.copyStyle());
  }
}
