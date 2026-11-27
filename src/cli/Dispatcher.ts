import type { CommandInvocation, ExtensionOutput, HostOperations, RenderingServices } from "../api";
import type { CliExecution } from "./CliOutput";
import type { Editor } from "../services/Editor";
import { CommandCatalog } from "./CommandCatalog";
import { Formatter } from "./Formatter";
import type { ParsedCommand } from "./ParsedCommand";

export class Dispatcher {
  private readonly rendering: RenderingServices;

  constructor(private readonly editor: Editor, private readonly catalog: CommandCatalog,
    private readonly formatter: Formatter) {
    this.rendering = Object.freeze<RenderingServices>({
      tree: (document, id) => {
        const node = id === undefined ? document : this.formatter.find(document, id);
        if (!node) throw new Error(`no such shape: ${id}`);
        return this.formatter.tree(node, this.editor.observation());
      },
      show: node => this.formatter.show(node),
    });
  }

  execute(request: ParsedCommand): CliExecution {
    const plan = this.catalog.invocation(request);
    if (plan.mode === "edit") {
      return [...(this.editor.executeInvocation(request.kind, plan, this.rendering).preparedFeedback ?? [])];
    }
    if (plan.mode === "query") {
      return this.output(plan.execute(Object.freeze({
        document: this.editor.query(), rendering: this.rendering, help: () => this.catalog.help(),
      })));
    }
    return this.host(plan);
  }

  private output(value: ExtensionOutput | Promise<ExtensionOutput>): CliExecution {
    return value instanceof Promise ? value : value.stderr.length ? Promise.resolve(value) : [...value.stdout];
  }

  private host(plan: Extract<CommandInvocation, { mode: "host" }>): CliExecution {
    let active = true, used = false;
    const check = () => { if (!active) throw new Error("host capability has expired"); };
    const operations: HostOperations = {
      initialize: (width, height) => this.editor.init(width, height),
      canvas: () => this.editor.getCanvas(),
      resize: (width, height) => this.editor.resizeCanvas(width, height),
      read: path => this.editor.read(path),
      save: path => this.editor.save(path),
      undo: () => ({ feedback: this.editor.undo().feedback ?? [] }),
      redo: () => ({ feedback: this.editor.redo().feedback ?? [] }),
    };
    const operation = operations[plan.capability];
    if (!Object.hasOwn(operations, plan.capability) || typeof operation !== "function") {
      throw new Error("unknown host capability");
    }
    const grant = Object.freeze({
      [plan.capability]: (...args: never[]) => {
        check();
        if (used) throw new Error("host capability already used");
        used = true;
        return (operation as (...args: never[]) => unknown)(...args);
      },
    });
    try {
      // Only the discriminant's single named method exists on the runtime grant.
      const execute = plan.execute as (port: typeof grant) => ExtensionOutput | Promise<ExtensionOutput>;
      const output = execute.call(plan, grant);
      if (output instanceof Promise) return output.finally(() => { active = false; });
      active = false;
      return this.output(output);
    } catch (error) {
      active = false;
      throw error;
    }
  }
}
