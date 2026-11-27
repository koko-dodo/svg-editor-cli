import type { RegistrationContext } from "../../src/api";
import { DirCommand } from "./DirCommand";
import { NodeDirectoryAdapter } from "./NodeDirectoryAdapter";
export function activate(context: RegistrationContext): void {
  context.registerCommand(new DirCommand(new NodeDirectoryAdapter()));
}
export default { activate };
