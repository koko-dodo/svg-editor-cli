import type { CliExecution } from "./CliOutput";
import type { Editor } from "../services/Editor";
import { CommandCatalog } from "./CommandCatalog";
import { Formatter } from "./Formatter";
import type { ParsedCommand } from "./ParsedCommand";

export class Dispatcher {
  constructor(private readonly editor: Editor, private readonly catalog: CommandCatalog,
    private readonly formatter = new Formatter()) {}

  execute(request: ParsedCommand): CliExecution {
    const before = this.editor.getStatus().hasDocument ? this.editor.tree() : undefined;
    return this.catalog.execute(request, this.editor, this.formatter, before);
  }
}
