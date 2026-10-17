import type { SvgDocument } from "../model/SvgDocument";
import type { Command } from "./Command";
import type { CommandResult } from "./CommandResult";

export class FrontCommand implements Command {
  constructor(private readonly id: string) {}

  execute(document: SvgDocument): CommandResult {
    document.bringToFront(this.id);
    return { operation: "front", targetIds: [this.id], parameters: {} };
  }
}
