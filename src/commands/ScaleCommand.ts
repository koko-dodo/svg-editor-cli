import type { SvgDocument } from "../model/SvgDocument";
import type { Command } from "./Command";
import type { CommandResult } from "./CommandResult";

export class ScaleCommand implements Command {
  constructor(private readonly id: string, private readonly factor: number) {}

  execute(document: SvgDocument): CommandResult {
    document.scale(this.id, this.factor);
    return { operation: "scale", targetIds: [this.id], parameters: { factor: this.factor } };
  }
}
