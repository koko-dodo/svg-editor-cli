import type { SvgDocument } from "../model/SvgDocument";
import type { Command } from "./Command";
import type { CommandResult } from "./CommandResult";

export class BackCommand implements Command {
  constructor(private readonly id: string) {}

  execute(document: SvgDocument): CommandResult {
    document.sendToBack(this.id);
    return { operation: "back", targetIds: [this.id], parameters: {} };
  }
}
