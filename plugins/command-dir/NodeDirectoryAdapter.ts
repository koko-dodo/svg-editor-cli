import { readdir } from "node:fs/promises";
import { cwd } from "node:process";
import type { DirectoryEntry, DirectoryPort } from "./DirectoryPort";

/** Adapter from Node Dirent to the command's filesystem-independent target. */
export class NodeDirectoryAdapter implements DirectoryPort {
  constructor(private readonly workingDirectory: () => string = cwd) {}
  currentDirectory(): string { return this.workingDirectory(); }
  async read(path: string): Promise<readonly DirectoryEntry[]> {
    const entries = await readdir(path, { withFileTypes: true });
    return Object.freeze(entries.map(entry => Object.freeze({ name: entry.name, directory: entry.isDirectory() })));
  }
}
