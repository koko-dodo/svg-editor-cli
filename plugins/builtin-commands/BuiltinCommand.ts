import type {
  Command, CommandInvocation, CommandToken, FeedbackContext, ShapeServices, ShapeView,
} from "../../src/api";
import type { ParsedCommand } from "./Requests";

type Name = ParsedCommand["kind"];
type Request<K extends Name> = Extract<ParsedCommand, { kind: K }>;

function singleLine(text: string): string { return text.replace(/\r/g, "\\r").replace(/\n/g, "\\n"); }

function formatting(context: FeedbackContext) {
  const find = (roots: readonly ShapeView[], id: string): ShapeView | undefined => {
    for (const node of roots) {
      if (node.id === id) return node;
      const nested = find(node.children, id);
      if (nested) return nested;
    }
    return undefined;
  };
  const label = (shape: ShapeView) => `${context.shapes!.present(shape).tag}#${singleLine(shape.id)}`;
  return {
    label,
    position: (shape: ShapeView) => context.shapes!.present(shape).position,
    value: (value: string | number) => typeof value === "string" ? JSON.stringify(value) : String(value),
    parent: (shape: ShapeView) => shape.parentId === null ? "svg"
      : label(find(context.after.roots, shape.parentId) ?? find(context.before.roots, shape.parentId)!),
    find: (document: { readonly roots: readonly ShapeView[] } | undefined, id: string) => find(document?.roots ?? [], id),
  };
}

export type Feedback = FeedbackContext & { readonly formatter: ReturnType<typeof formatting> };

/** A class instance per command, with plugin-owned parsing, execution and feedback. */
export class BuiltinCommand<K extends Name> implements Command {
  constructor(readonly name: K, readonly syntax: string,
    private readonly parseRequest: (args: readonly CommandToken[], shapes: ShapeServices) => Request<K>,
    private readonly plan: (request: Request<K>) => CommandInvocation,
    private readonly describe?: (context: Feedback) => string) {}

  parse(args: readonly CommandToken[], shapes: ShapeServices): CommandInvocation {
    const request = this.parseRequest(args, shapes);
    return { ...this.plan(request), request };
  }

  describeOperation(context: FeedbackContext): readonly string[] | undefined {
    return this.describe ? [this.describe({ ...context, formatter: formatting(context) })] : undefined;
  }
}
