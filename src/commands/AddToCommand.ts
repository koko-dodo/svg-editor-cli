import type { SvgDocument } from "../model/SvgDocument";
import type { Command } from "./Command";
import type { CommandResult } from "./CommandResult";

export class AddToCommand implements Command {
  constructor(private readonly groupId: string, private readonly id: string) {}

  execute(document: SvgDocument): CommandResult {
    document.addTo(this.groupId, this.id);
    return { operation: "addto", targetIds: [this.id], parameters: { groupId: this.groupId } };
  }
}
