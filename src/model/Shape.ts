import { StyleValidation } from "./StyleValidation";

export interface ShapeStyle {
  readonly fill?: string;
  readonly stroke?: string;
  readonly "stroke-width"?: number;
}

export abstract class Shape {
  private readonly _id: string;
  private _fill: string | undefined;
  private _stroke: string | undefined;
  private _strokeWidth: number | undefined;

  protected constructor(id: string, style: ShapeStyle = {}) {
    if (typeof id !== "string" || id.trim() === "") throw new Error("id must not be empty");
    this._id = id;
    if (style.fill !== undefined) this.setCommonAttribute("fill", style.fill);
    if (style.stroke !== undefined) this.setCommonAttribute("stroke", style.stroke);
    if (style["stroke-width"] !== undefined) this.setCommonAttribute("stroke-width", style["stroke-width"]);
  }

  get id(): string { return this._id; }
  get fill(): string | undefined { return this._fill; }
  get stroke(): string | undefined { return this._stroke; }
  get strokeWidth(): number | undefined { return this._strokeWidth; }

  abstract move(dx: number, dy: number): void;
  abstract scale(factor: number): void;
  abstract clone(): Shape;

  setAttribute(name: string, value: string | number): void {
    if (!this.setCommonAttribute(name, value)) this.setOwnAttribute(name, value);
  }

  protected abstract setOwnAttribute(name: string, value: string | number): void;

  protected finite(value: number, name: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
    return value;
  }

  protected nonNegative(value: number, name: string): number {
    this.finite(value, name);
    if (value < 0) throw new Error(`${name} must be non-negative`);
    return value;
  }

  protected numeric(value: string | number, name: string): number {
    // Accept complete decimal numbers (including exponent notation), never partial parses.
    if (typeof value === "string") {
      const text = value.trim();
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
        throw new Error(`${name} must be a finite number`);
      }
      return this.finite(Number(text), name);
    }
    return this.finite(value, name);
  }

  protected scaleFactor(factor: number): number {
    if (typeof factor !== "number" || !Number.isFinite(factor) || factor <= 0) {
      throw new Error("scale factor must be positive");
    }
    return factor;
  }

  protected copyStyle(): ShapeStyle {
    return {
      ...(this._fill === undefined ? {} : { fill: this._fill }),
      ...(this._stroke === undefined ? {} : { stroke: this._stroke }),
      ...(this._strokeWidth === undefined ? {} : { "stroke-width": this._strokeWidth }),
    };
  }

  private setCommonAttribute(name: string, value: string | number): boolean {
    if (name === "fill" || name === "stroke") {
      if (typeof value !== "string") throw new Error(`${name} must be a string`);
      StyleValidation.paint(value);
      if (name === "fill") this._fill = value;
      else this._stroke = value;
      return true;
    }
    if (name === "stroke-width") {
      this._strokeWidth = this.nonNegative(this.numeric(value, name), name);
      return true;
    }
    return false;
  }
}
