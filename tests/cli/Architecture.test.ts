import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("CLI dependency and dispatch boundaries", () => {
  it("imports no model, concrete command, or IO modules", () => {
    for (const file of readdirSync("src/cli")) {
      const source = readFileSync(join("src/cli", file), "utf8");
      expect(source, file).not.toMatch(/from\s+["']\.\.\/(model|commands|io)\//);
    }
  });
  it("keeps the command registry and concrete shape class names centralized", () => {
    for (const file of readdirSync("src/cli")) {
      const source = readFileSync(join("src/cli", file), "utf8");
      expect(source, file).not.toMatch(/switch\s*\(/);
      if (file !== "CommandCatalog.ts") expect(source, file).not.toMatch(/\.register\(["'](?:move|create|undo|group)["']/);
      if (file !== "ShapeSyntax.ts") expect(source, file).not.toMatch(/["'](?:Rectangle|Circle|Ellipse|Line|TextShape|Group)["']/);
    }
  });
});
