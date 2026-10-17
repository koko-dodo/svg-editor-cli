import { Shape } from "./Shape";
import type { ShapeStyle } from "./Shape";

export class Rectangle extends Shape {
  private _x: number;
  private _y: number;
  private _width: number;
  private _height: number;

  constructor(id: string, x: number, y: number, width: number, height: number, style: ShapeStyle = {}) {
    super(id, style);
    this._x = this.finite(x, "x");
    this._y = this.finite(y, "y");
    this._width = this.nonNegative(width, "width");
    this._height = this.nonNegative(height, "height");
  }

  get x(): number { return this._x; }
  get y(): number { return this._y; }
  get width(): number { return this._width; }
  get height(): number { return this._height; }

  override move(dx: number, dy: number): void {
    this.finite(dx, "dx");
    this.finite(dy, "dy");
    const x = this.finite(this._x + dx, "x");
    const y = this.finite(this._y + dy, "y");
    this._x = x;
    this._y = y;
  }

  override scale(factor: number): void {
    this.scaleFactor(factor);
    const x = this.finite(this._x * factor, "x");
    const y = this.finite(this._y * factor, "y");
    const width = this.finite(this._width * factor, "width");
    const height = this.finite(this._height * factor, "height");
    this._x = x;
    this._y = y;
    this._width = width;
    this._height = height;
  }

  protected override setOwnAttribute(name: string, value: string | number): void {
    if (name === "x") { this._x = this.numeric(value, name); return; }
    if (name === "y") { this._y = this.numeric(value, name); return; }
    if (name === "width") { this._width = this.nonNegative(this.numeric(value, name), name); return; }
    if (name === "height") { this._height = this.nonNegative(this.numeric(value, name), name); return; }
    throw new Error(`unknown attribute: ${name}`);
  }

  override clone(): Rectangle {
    return new Rectangle(this.id, this._x, this._y, this._width, this._height, this.copyStyle());
  }
}
