import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { expect, it } from "vitest";

// Project architecture agreement, not a prescribed directory layout in the lab.
const allowed: Record<string, readonly string[]> = {
  model: [], commands: ["model"], io: ["model"],
  services: ["commands", "model", "io"], cli: ["services"],
};
const root = resolve(__dirname, "../../src");
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(directory, entry.name)) : entry.name.endsWith(".ts") ? [join(directory, entry.name)] : []);
}
function dependencies(source: string): string[] {
  // Match the literal module forms used in this repository, including re-exports,
  // side effects, type imports, require and dynamic import. Not a general TS parser.
  return [...source.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\b(?:require|import)\s*\(\s*["']([^"']+)["']\s*\)/g)]
    .map(match => (match[1] ?? match[2] ?? match[3])!);
}

it("checks literal imports and re-exports recursively across every src module", () => {
  const checked = new Set<string>(); const violations: string[] = [];
  for (const path of files(root)) {
    const from = relative(root, path).split(/[\\/]/)[0]!;
    const source = readFileSync(path, "utf8");
    if (from !== "main.ts") checked.add(from);
    for (const specifier of dependencies(source)) {
      if (!specifier.startsWith(".")) continue; // External packages and Node builtins.
      const targetPath = resolve(dirname(path), specifier);
      expect(existsSync(`${targetPath}.ts`) || existsSync(join(targetPath, "index.ts")), `${path}: ${specifier}`).toBe(true);
      const target = relative(root, targetPath);
      const to = target.split(/[\\/]/)[0]!;
      if (from !== "main.ts" && from !== to && !allowed[from]?.includes(to)) {
        violations.push(`${relative(root, path)} -> ${target}`);
      }
    }
  }
  expect([...checked].sort()).toEqual(["cli", "commands", "io", "model", "services"]);
  expect(violations).toEqual([]);
});

it("includes alternate literal import forms rather than checking only CLI from clauses", () => {
  expect(dependencies(`
    import "./side-effect";
    import type { X } from "../model/X";
    export { Y } from "../services/Y";
    export * from "../io/Z";
    const a = import("../cli/A");
    const b = require("../commands/B");
    import C = require("../model/C");
    type D = import("../model/D").D;
  `)).toEqual(["./side-effect", "../model/X", "../services/Y", "../io/Z", "../cli/A", "../commands/B", "../model/C", "../model/D"]);
});
