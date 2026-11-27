import type { RegistrationContext } from "../../src/api";
import { BuiltinCommands } from "./BuiltinCommands";

export function activate(context: RegistrationContext): void { new BuiltinCommands(context); }
export default { activate };
