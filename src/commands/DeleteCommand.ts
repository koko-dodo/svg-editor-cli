import type { SvgDocument } from "../model/SvgDocument";
import type { Command } from "./Command";
import type { CommandResult } from "./CommandResult";

export class DeleteCommand implements Command {
  constructor(private readonly id: string) {}

  execute(document: SvgDocument): CommandResult {
    document.deleteShape(this.id);
    return { operation: "delete", targetIds: [this.id], parameters: {} };
  }
}
