import type { RegistrationContext } from "../../src/api";
import { BoxProvider } from "./BoxProvider";
import { BoxAttributes } from "./BoxAttributes";
import { BoxDecorator } from "./BoxDecorator";
export function activate(context: RegistrationContext): void {
  context.registerShape(new BoxProvider());
  context.registerAttribute(new BoxAttributes());
  context.registerDecorator(new BoxDecorator());
}
export default { activate };
