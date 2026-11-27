import type { Command, CommandInvocation, CommandToken } from "../../src/api";
import type { DirectoryPort } from "./DirectoryPort";

export class DirCommand implements Command {
  readonly name = "dir";
  readonly syntax = "dir";
  constructor(private readonly directory: DirectoryPort) {}

  parse(args: readonly CommandToken[]): CommandInvocation {
    if (args.length) throw new Error("usage: dir");
    return { mode: "query", execute: async () => {
      const path = this.directory.currentDirectory();
      try {
        const entries = (await this.directory.read(path)).filter(entry => entry.name !== "." && entry.name !== "..");
        entries.sort((a, b) => a.directory !== b.directory ? (a.directory ? -1 : 1)
          : a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
        return { stdout: entries.length ? entries.map(entry => {
          const name = entry.name.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
          return `[${entry.directory ? "DIR" : "FILE"}]  ${name}`;
        }) : ["(empty directory)"], stderr: [] };
      } catch { throw new Error(`cannot read directory: ${path}`); }
    } };
  }
}
