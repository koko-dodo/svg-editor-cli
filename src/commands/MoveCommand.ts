import type { SvgDocument } from "../model/SvgDocument";
import type { Command } from "./Command";
import type { CommandResult } from "./CommandResult";

export class MoveCommand implements Command {
  constructor(private readonly id: string, private readonly dx: number, private readonly dy: number) {}

  execute(document: SvgDocument): CommandResult {
    document.move(this.id, this.dx, this.dy);
    return { operation: "move", targetIds: [this.id], parameters: { dx: this.dx, dy: this.dy } };
  }
}
