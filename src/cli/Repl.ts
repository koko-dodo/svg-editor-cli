import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { Editor } from "../services/Editor";
import { CommandCatalog } from "./CommandCatalog";
import { Dispatcher } from "./Dispatcher";
import { Formatter } from "./Formatter";
import { Parser } from "./Parser";

export class Repl {
  private readonly parser: Parser;
  private readonly dispatcher: Dispatcher;
  private readonly formatter = new Formatter();

  constructor(private readonly input: Readable, private readonly output: Writable,
    private readonly errors: Writable, private readonly interactive = false, editor = new Editor()) {
    const catalog = new CommandCatalog();
    this.parser = new Parser(catalog);
    this.dispatcher = new Dispatcher(editor, catalog, this.formatter);
  }

  async run(): Promise<void> {
    const lines = createInterface({ input: this.input, output: this.output, terminal: this.interactive, crlfDelay: Infinity });
    let closed = false;
    lines.once("close", () => { closed = true; });
    try {
      if (this.interactive) {
        this.output.write("svg-editor 0.1 — type 'help' for commands\n");
        lines.setPrompt("svg> ");
        lines.prompt();
      }
      for await (const line of lines) {
        let messages: readonly string[] = [];
        let warnings: readonly string[] = [];
        let error: string | undefined;
        try {
          const request = this.parser.parse(line);
          if (request !== null) {
            const result = await this.dispatcher.execute(request);
            if (Array.isArray(result)) messages = result;
            else { messages = result.stdout; warnings = result.stderr; }
          }
        } catch (cause) {
          error = this.formatter.error(cause);
        }
        // Stream failures are not reported as rejected editing commands.
        if (error !== undefined) this.errors.write(`${error}\n`);
        else {
          for (const warning of warnings) this.errors.write(`${warning}\n`);
          for (const message of messages) this.output.write(`${message}\n`);
        }
        if (this.interactive && !closed) lines.prompt();
      }
    } finally {
      lines.close();
    }
  }
}
