import type { CliExecution } from "./CliOutput";
import type { Editor } from "../services/Editor";
import type { CommandResult, DocumentView, ShapeView } from "../services/EditorTypes";
import type { ParsedCommand } from "./ParsedCommand";
import { ShapeSyntax } from "./ShapeSyntax";
import { Tokenizer } from "./Tokenizer";
import type { Token } from "./Tokenizer";
import type { Formatter } from "./Formatter";

type Name = ParsedCommand["kind"];
type Request<K extends Name> = Extract<ParsedCommand, { kind: K }>;
type Direction = "execute" | "undo" | "redo";
interface Feedback {
  readonly result: CommandResult;
  readonly before: DocumentView | undefined;
  readonly after: DocumentView;
  readonly direction: Direction;
  readonly formatter: Formatter;
}
interface Definition {
  readonly syntax: string;
  readonly parse: (args: readonly Token[]) => ParsedCommand;
  readonly run: (request: ParsedCommand, editor: Editor, formatter: Formatter, before: DocumentView | undefined) => CliExecution;
  readonly describe: ((context: Feedback) => string) | undefined;
}

/** The sole CLI command-name registry: parsing, execution, help and feedback. */
export class CommandCatalog {
  private readonly definitions = new Map<string, Definition>();

  constructor(private readonly shapes = new ShapeSyntax()) {
    this.register("init", "init [w] [h]", args => {
      this.arity(args, 0, 2, "init [w] [h]");
      return { kind: "init", width: args[0] ? Tokenizer.number(args[0], "width") : 800, height: args[1] ? Tokenizer.number(args[1], "height") : 600 };
    }, (c, e) => { const size = e.init(c.width, c.height); return [`canvas ${size.width}x${size.height} created`]; });
    this.register("canvas", "canvas [w h]", args => {
      if (args.length !== 0 && args.length !== 2) throw new Error("usage: canvas [w h]");
      return { kind: "canvas", size: args.length === 0 ? null : { width: Tokenizer.number(args[0]!, "width"), height: Tokenizer.number(args[1]!, "height") } };
    }, (c, e) => {
      const size = c.size === null ? e.getCanvas() : e.resizeCanvas(c.size.width, c.size.height);
      return [`canvas ${size.width}x${size.height}${c.size === null ? "" : " resized"}`];
    });
    this.register("create", "create <type> <id> [params...] [in <containerId>]",
      args => ({ kind: "create", request: this.shapes.parse(args) }),
      (c, e, f, b) => this.edit(e.create(c.request), e, f, b), context => {
        const shape = this.target(context);
        return context.direction === "undo" ? `${context.formatter.label(shape)} deleted`
          : `${context.formatter.label(shape)} created${shape.parentId === null ? "" : ` in ${context.formatter.parent(shape)}`}`;
      });
    this.register("delete", "delete <id>", args => ({ kind: "delete", id: this.id(args, "delete <id>") }),
      (c, e, f, b) => this.edit(e.delete(c.id), e, f, b), context => {
        const shape = this.target(context);
        return `${context.formatter.label(shape)} ${context.direction === "undo" ? `restored into ${context.formatter.parent(shape)}` : "deleted"}`;
      });
    this.register("move", "move <id> <dx> <dy>", args => {
      this.arity(args, 3, 3, "move <id> <dx> <dy>");
      return { kind: "move", id: args[0]!.value, dx: Tokenizer.number(args[1]!, "dx"), dy: Tokenizer.number(args[2]!, "dy") };
    }, (c, e, f, b) => this.edit(e.move(c.id, c.dx, c.dy), e, f, b), context => {
      const shape = this.target(context);
      const position = context.formatter.position(shape);
      const backward = context.direction === "undo";
      const dx = Number(context.result.parameters.dx) * (backward ? -1 : 1);
      const dy = Number(context.result.parameters.dy) * (backward ? -1 : 1);
      return `${context.formatter.label(shape)} moved${backward ? " back" : ""} ${position === null ? `by (${dx},${dy})` : `to ${position}`}`;
    });
    this.register("scale", "scale <id> <factor>", args => {
      this.arity(args, 2, 2, "scale <id> <factor>");
      return { kind: "scale", id: args[0]!.value, factor: Tokenizer.number(args[1]!, "factor") };
    }, (c, e, f, b) => this.edit(e.scale(c.id, c.factor), e, f, b), context => {
      const label = context.formatter.label(this.target(context));
      return context.direction === "undo" ? `${label} scale undone; geometry restored` : `${label} scaled by ${context.result.parameters.factor}`;
    });
    this.register("set", "set <id> <attr> <value>", args => {
      this.arity(args, 3, 3, "set <id> <attr> <value>");
      return { kind: "set", id: args[0]!.value, attribute: args[1]!.value, value: args[2]!.value };
    }, (c, e, f, b) => this.edit(e.setAttribute(c.id, c.attribute, c.value), e, f, b), context => {
      const shape = this.target(context);
      const name = String(context.result.parameters.name);
      const value = shape.attributes[name];
      return `${context.formatter.label(shape)} updated: ${name}=${value === undefined ? "<unset>" : context.formatter.value(value)}`;
    });
    this.register("group", "group <newGid> <id1> [id2 ...]", args => {
      this.arity(args, 2, Infinity, "group <newGid> <id1> [id2 ...]");
      return { kind: "group", id: args[0]!.value, members: args.slice(1).map(token => token.value) };
    }, (c, e, f, b) => this.edit(e.group(c.id, c.members), e, f, b), context => {
      const shape = this.target(context);
      return context.direction === "undo" ? `${context.formatter.label(shape)} grouping undone; original parents and order restored`
        : `${context.formatter.label(shape)} created with ${shape.children.length} children`;
    });
    this.register("ungroup", "ungroup <gid>", args => ({ kind: "ungroup", id: this.id(args, "ungroup <gid>") }),
      (c, e, f, b) => this.edit(e.ungroup(c.id), e, f, b), context => {
        const shape = this.target(context);
        return context.direction === "undo" ? `${context.formatter.label(shape)} restored into ${context.formatter.parent(shape)} with ${shape.children.length} children`
          : `${context.formatter.label(shape)} ungrouped`;
      });
    this.register("addto", "addto <gid> <id>", args => {
      this.arity(args, 2, 2, "addto <gid> <id>");
      return { kind: "addto", groupId: args[0]!.value, id: args[1]!.value };
    }, (c, e, f, b) => this.edit(e.addTo(c.groupId, c.id), e, f, b), context => {
      const shape = this.target(context);
      return `${context.formatter.label(shape)} ${context.direction === "undo" ? "restored" : "moved"} into ${context.formatter.parent(shape)}`;
    });
    this.register("front", "front <id>", args => ({ kind: "front", id: this.id(args, "front <id>") }),
      (c, e, f, b) => this.edit(e.front(c.id), e, f, b), context => this.orderFeedback(context, "front"));
    this.register("back", "back <id>", args => ({ kind: "back", id: this.id(args, "back <id>") }),
      (c, e, f, b) => this.edit(e.back(c.id), e, f, b), context => this.orderFeedback(context, "back"));
    this.register("tree", "tree [id]", args => {
      this.arity(args, 0, 1, "tree [id]"); return { kind: "tree", id: args[0]?.value };
    }, (c, e, f) => f.tree(e.tree(c.id)));
    this.register("show", "show <id>", args => ({ kind: "show", id: this.id(args, "show <id>") }),
      (c, e, f) => f.show(e.show(c.id)));
    this.register("help", "help", args => {
      this.arity(args, 0, 0, "help"); return { kind: "help" };
    }, () => this.help());
    this.register("undo", "undo", args => {
      this.arity(args, 0, 0, "undo"); return { kind: "undo" };
    }, (_c, e, f, b) => {
      const result = e.undo();
      return [this.feedback({ result: result.command, before: b, after: result.restored, direction: result.direction, formatter: f })];
    });
    this.register("redo", "redo", args => {
      this.arity(args, 0, 0, "redo"); return { kind: "redo" };
    }, (_c, e, f, b) => {
      const result = e.redo();
      return [this.feedback({ result: result.command, before: b, after: result.restored, direction: result.direction, formatter: f })];
    });
    this.register("read", "read <file.svg>", args => ({ kind: "read", path: this.id(args, "read <file.svg>") }),
      async (c, e) => {
        const result = await e.read(c.path);
        return { stdout: [`read ${JSON.stringify(result.path).slice(1, -1)} (${result.elements} elements)`],
          stderr: result.warnings.map(w => `warning: assigned id ${w.id} to unnamed <${w.tag}>`) };
      });
    this.register("save", "save [file.svg]", args => {
      this.arity(args, 0, 1, "save [file.svg]"); return { kind: "save", path: args[0]?.value };
    }, async (c, e) => {
      const result = await e.save(c.path);
      return { stdout: [`saved to ${JSON.stringify(result.path).slice(1, -1)} (${result.elements} elements)`], stderr: [] };
    });
  }

  parse(tokens: readonly Token[]): ParsedCommand | null {
    if (tokens.length === 0) return null;
    const name = tokens[0]!.value;
    const definition = this.definitions.get(name);
    if (!definition) throw new Error(`unknown command: ${name}`);
    return definition.parse(tokens.slice(1));
  }

  execute(request: ParsedCommand, editor: Editor, formatter: Formatter, before: DocumentView | undefined): CliExecution {
    const definition = this.definitions.get(request.kind)!;
    return definition.run(request, editor, formatter, before);
  }

  private register<K extends Name>(name: K, syntax: string,
    parse: (args: readonly Token[]) => Request<K>,
    run: (request: Request<K>, editor: Editor, formatter: Formatter, before: DocumentView | undefined) => CliExecution,
    describe?: (context: Feedback) => string): void {
    this.definitions.set(name, {
      syntax, parse, describe,
      run: (request, editor, formatter, before) => {
        if (request.kind !== name) throw new Error("command dispatch mismatch");
        return run(request as Request<K>, editor, formatter, before);
      },
    });
  }

  private arity(args: readonly Token[], min: number, max: number, syntax: string): void {
    if (args.length < min || args.length > max) throw new Error(`usage: ${syntax}`);
  }
  private id(args: readonly Token[], syntax: string): string {
    this.arity(args, 1, 1, syntax); return args[0]!.value;
  }
  private help(): string[] {
    return [...this.definitions.values()].map(item => item.syntax).concat(["", "Create parameters:", ...this.shapes.help()]);
  }
  private edit(result: CommandResult, editor: Editor, formatter: Formatter, before: DocumentView | undefined): string[] {
    return [this.feedback({ result, before, after: editor.tree(), direction: "execute", formatter })];
  }
  private feedback(context: Feedback): string {
    return this.definitions.get(context.result.operation)!.describe!(context);
  }
  private target(context: Feedback): ShapeView {
    const id = context.result.targetIds[0]!;
    const shape = context.formatter.find(context.after, id) ?? context.formatter.find(context.before, id);
    if (!shape) throw new Error(`missing feedback target: ${id}`);
    return shape;
  }
  private orderFeedback(context: Feedback, direction: string): string {
    const shape = this.target(context);
    return `${context.formatter.label(shape)} ${context.direction === "undo" ? "z-order restored" : `moved to ${direction}`}`;
  }
}
