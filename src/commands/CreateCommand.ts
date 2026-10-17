import type { Shape } from "../model/Shape";
import type { SvgDocument } from "../model/SvgDocument";
import type { Command } from "./Command";
import type { CommandResult } from "./CommandResult";

export class CreateCommand implements Command {
  private readonly template: Shape;

  constructor(template: Shape, private readonly parentId?: string) {
    this.template = template.clone();
  }

  execute(document: SvgDocument): CommandResult {
    document.addShape(this.template, this.parentId);
    return {
      operation: "create",
      targetIds: [this.template.id],
      parameters: this.parentId === undefined ? {} : { parentId: this.parentId },
    };
  }
}
