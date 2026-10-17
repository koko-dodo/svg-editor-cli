import type { SvgDocument } from "../model/SvgDocument";
import type { Command } from "./Command";
import type { CommandResult } from "./CommandResult";

export class SetAttributeCommand implements Command {
  constructor(private readonly id: string, private readonly name: string, private readonly value: string | number) {}

  execute(document: SvgDocument): CommandResult {
    document.setAttribute(this.id, this.name, this.value);
    return { operation: "set", targetIds: [this.id], parameters: { name: this.name, value: this.value } };
  }
}
