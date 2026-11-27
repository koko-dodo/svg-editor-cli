import { BuiltinShapeProvider } from "./BuiltinShapeProvider";
import type { Shape, ShapeStyle } from "../../src/api";

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

/** Legacy six-shape request adapter, retained for typed callers and regression tests.
 * Actual construction is selected by the provider's stable semantic kind.
 */
export class ShapeFactory {
  create(request: ShapeDefinition): Shape {
    if (!["rect", "circle", "ellipse", "line", "text", "g"].includes(request.type)) {
      throw new Error(`unknown shape type: ${request.type} (is the plugin loaded?)`);
    }
    const {type, id, ...parameters} = request;
    return new BuiltinShapeProvider(type).create(id, parameters);
  }
}
export type CreateRequest = ShapeDefinition & { readonly parentId?: string };
