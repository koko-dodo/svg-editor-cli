import type { RegistrationContext } from "../../src/api";
import { StatsCommand } from "./StatsCommand";
export function activate(context: RegistrationContext): void { context.registerCommand(new StatsCommand()); }
export default { activate };
