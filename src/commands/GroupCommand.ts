import type { SvgDocument } from "../model/SvgDocument";
import type { Command } from "./Command";
import type { CommandResult } from "./CommandResult";

export class GroupCommand implements Command {
  private readonly ids: readonly string[];

  constructor(private readonly newId: string, ids: readonly string[]) {
    this.ids = Object.freeze([...ids]);
  }

  execute(document: SvgDocument): CommandResult {
    document.group(this.newId, this.ids);
    return {
      operation: "group",
      targetIds: [this.newId],
      parameters: { memberIds: [...this.ids] },
    };
  }
}
