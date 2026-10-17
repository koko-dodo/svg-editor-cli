import { Shape } from "./Shape";
import type { ShapeStyle } from "./Shape";

export class TextShape extends Shape {
  private _x: number;
  private _y: number;
  private _text: string;

  constructor(id: string, x: number, y: number, text: string, style: ShapeStyle = {}) {
    super(id, style);
    this._x = this.finite(x, "x");
    this._y = this.finite(y, "y");
    if (typeof text !== "string") throw new Error("text must be a string");
    this._text = text;
  }

  get x(): number { return this._x; }
  get y(): number { return this._y; }
  get text(): string { return this._text; }

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
    this._x = x;
    this._y = y;
  }

  protected override setOwnAttribute(name: string, value: string | number): void {
    if (name === "x") { this._x = this.numeric(value, name); return; }
    if (name === "y") { this._y = this.numeric(value, name); return; }
    if (name === "text") {
      if (typeof value !== "string") throw new Error("text must be a string");
      this._text = value;
      return;
    }
    throw new Error(`unknown attribute: ${name}`);
  }

  override clone(): TextShape {
    return new TextShape(this.id, this._x, this._y, this._text, this.copyStyle());
  }
}
