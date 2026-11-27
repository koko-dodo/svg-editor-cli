import type { RegistrationContext } from "../../src/api";
import { BuiltinShapeProvider } from "./BuiltinShapeProvider";
export { Group } from "./Group";
export function activate(context: RegistrationContext): void {
  for (const kind of ["rect", "circle", "ellipse", "line", "text", "g"] as const) context.registerShape(new BuiltinShapeProvider(kind));
}
export default { activate };
