import type { SvgDocument } from "../model/SvgDocument";
import type { Command } from "./Command";
import type { CommandResult } from "./CommandResult";

export class UngroupCommand implements Command {
  constructor(private readonly id: string) {}

  execute(document: SvgDocument): CommandResult {
    document.ungroup(this.id);
    return { operation: "ungroup", targetIds: [this.id], parameters: {} };
  }
}
