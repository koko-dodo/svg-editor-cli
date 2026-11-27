import type { RegistrationContext } from "../../src/api";
import { ModifiedStarDecorator } from "./ModifiedStarDecorator";

export function activate(context: RegistrationContext): void {
  context.registerDecorator(new ModifiedStarDecorator());
}
export default { activate };
