import { Rectangle } from "./Rectangle";
import { Circle } from "./Circle";
import { Ellipse } from "./Ellipse";
import { Line } from "./Line";
import { TextShape } from "./TextShape";
import { Group } from "./Group";
import type { Shape, ShapeStyle } from "./Shape";

type ShapeIdentity = { readonly id: string } & ShapeStyle;

/** Construction data only; parent placement belongs to the application request. */
export type ShapeDefinition = ShapeIdentity & (
  | { readonly type: "rect"; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  | { readonly type: "circle"; readonly cx: number; readonly cy: number; readonly r: number }
  | { readonly type: "ellipse"; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number }
  | { readonly type: "line"; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }
  | { readonly type: "text"; readonly x: number; readonly y: number; readonly text: string }
  | { readonly type: "g" }
);

/** Centralized name dispatch; a future registration mechanism may replace it. */
export class ShapeFactory {
  create(request: ShapeDefinition): Shape {
    const type: string = request.type;
    switch (request.type) {
      case "rect": return new Rectangle(request.id, request.x, request.y, request.width, request.height, request);
      case "circle": return new Circle(request.id, request.cx, request.cy, request.r, request);
      case "ellipse": return new Ellipse(request.id, request.cx, request.cy, request.rx, request.ry, request);
      case "line": return new Line(request.id, request.x1, request.y1, request.x2, request.y2, request);
      case "text": return new TextShape(request.id, request.x, request.y, request.text, request);
      case "g": return new Group(request.id, request);
      default: throw new Error(`unknown shape type: ${type} (is the plugin loaded?)`);
    }
  }
}
