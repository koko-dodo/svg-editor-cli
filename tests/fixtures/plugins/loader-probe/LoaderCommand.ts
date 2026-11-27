import type { Command, CommandInvocation, CommandToken } from "../../../../src/api";

export class LoaderCommand implements Command {
  readonly name = "loader-echo";
  readonly syntax = "loader-echo";
  constructor(private readonly label: string) {}
  parse(args: readonly CommandToken[]): CommandInvocation {
    if (args.length) throw new Error("usage: loader-echo");
    return { mode: "query", execute: context => ({ stdout: [this.label, String(context.document?.view().roots.length ?? 0)], stderr: [] }) };
  }
}
