import type { Command, CommandInvocation, CommandToken, ShapeView } from "../../src/api";

/** Read-only DFS over the public view; semantic kinds never depend on class names. */
export class StatsCommand implements Command {
  readonly name = "stats";
  readonly syntax = "stats";

  parse(args: readonly CommandToken[]): CommandInvocation {
    if (args.length) throw new Error("usage: stats");
    return { mode: "query", execute: context => {
      if (!context.document) throw new Error("no document. use 'init' or 'read' first");
      const counts = new Map<string, number>();
      let total = 0, containers = 0;
      const visit = (nodes: readonly ShapeView[]): void => {
        for (const node of nodes) {
          if (node.container) containers++;
          else { counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1); total++; }
          visit(node.children);
        }
      };
      visit(context.document.view().roots);
      const types = [...counts].map(([kind, count]) => `${kind}: ${count}`);
      const summary = `(total ${total}, containers ${containers})`;
      return { stdout: [types.length ? `${types.join("  ")}  ${summary}` : summary], stderr: [] };
    } };
  }
}
