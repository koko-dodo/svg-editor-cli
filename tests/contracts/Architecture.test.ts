import { isBuiltin } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { expect, it } from "vitest";
import { API } from "typescript/unstable/sync";
import { createVirtualFileSystem } from "typescript/unstable/fs";
import * as ts from "typescript/unstable/ast";

// Project architecture agreement, not a prescribed directory layout in the lab.
const allowed: Record<string, readonly string[]> = {
  api: ["model"], model: ["api"], commands: ["model", "api"], io: ["model", "api", "extensions"],
  extensions: ["api", "model"],
  services: ["commands", "model", "io", "api", "extensions"], cli: ["services", "api", "extensions"], host: ["api", "model", "io", "services", "cli", "extensions"],
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
      const hostPlugin = from === "host" && targetPath.startsWith(resolve(root, "../plugins") + sep);
      if (from !== "main.ts" && from !== to && !hostPlugin && !allowed[from]?.includes(to)) {
        violations.push(`${relative(root, path)} -> ${target}`);
      }
    }
  }
  expect([...checked].sort()).toEqual(["api", "cli", "commands", "extensions", "host", "io", "model", "services"]);
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

it("keeps the public entry free of application/history/document exports and test plugins on public imports", () => {
  const entry = readFileSync(join(root, "api/index.ts"), "utf8");
  expect(entry).not.toMatch(/SvgDocument|CommandHistory|Session|Editor|ShapeFactory|ShapeSchema/);
  const plugin = readFileSync(resolve(root, "../tests/support/ContractShapes.ts"), "utf8");
  expect(dependencies(plugin)).toEqual(["../../src/api", "../../src/api"]);
  for (const path of files(join(root, "model"))) {
    expect(dependencies(readFileSync(path, "utf8")).filter(name => /commands|services|cli|host/.test(name))).toEqual([]);
  }
});

// TS 7 exposes parsing through its bundled native API. Virtual files avoid disk
// fixtures; every snapshot/client is disposed, including assertion failures.
function runtimeApiDependencies(source: string, path = join(root, "model/Probe.ts")): string[] {
  const file = "/architecture-probe/probe.ts";
  const config = "/architecture-probe/tsconfig.json";
  const compiler = new API({ fs: createVirtualFileSystem({
    [file]: source,
    [config]: JSON.stringify({ compilerOptions: { noLib: true }, files: ["probe.ts"] }),
  }) });
  try {
    const snapshot = compiler.updateSnapshot({ openProjects: [config] });
    try {
      const program = snapshot.getProject(config)!.program;
      expect(program.getSyntacticDiagnostics(file)).toEqual([]);
      const sourceFile = program.getSourceFile(file)!;
      const result: string[] = [];
      const record = (specifier: ts.Node | undefined): void => {
        if (!specifier || !ts.isStringLiteralLikeNode(specifier)) return;
        const target = resolve(dirname(path), specifier.text);
        const api = join(root, "api");
        if (target === api || target.startsWith(api + sep)) result.push(specifier.text);
      };
      const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node)) {
          const clause = node.importClause;
          const bindings = clause?.namedBindings;
          const typeOnly = clause?.phaseModifier === ts.SyntaxKind.TypeKeyword ||
            (clause !== undefined && clause.name === undefined && bindings !== undefined &&
              ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every(item => item.isTypeOnly));
          if (!typeOnly) record(node.moduleSpecifier);
        } else if (ts.isExportDeclaration(node)) {
          const bindings = node.exportClause;
          const typeOnly = node.isTypeOnly || (bindings !== undefined && ts.isNamedExports(bindings) &&
            bindings.elements.length > 0 && bindings.elements.every(item => item.isTypeOnly));
          if (!typeOnly) record(node.moduleSpecifier);
        } else if (ts.isImportEqualsDeclaration(node)) {
          if (!node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)) record(node.moduleReference.expression);
        } else if (ts.isCallExpression(node)) {
          if (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === "require")) record(node.arguments[0]);
        }
        node.forEachChild(visit);
      };
      visit(sourceFile);
      return result;
    } finally { snapshot.dispose(); }
  } finally { compiler.close(); }
}

it("allows only type dependencies from every model module to api", () => {
  for (const path of files(join(root, "model"))) {
    expect(runtimeApiDependencies(readFileSync(path, "utf8"), path), relative(root, path)).toEqual([]);
  }
});

it.each([
  'import type { DocumentQuery } from "../api/Domain";',
  'import type * as Domain from "../api/Domain";',
  'import { type DocumentQuery, type Attributes as A } from "../api/Domain";',
  'export type { DocumentQuery } from "../api/Domain";',
  'export { type DocumentQuery, type Attributes } from "../api/Domain";',
  'export type * from "../api/Domain";',
  'import type Domain = require("../api/Domain");',
  'type Query = import("../api/Domain").DocumentQuery; type Module = typeof import("../api/Domain");',
  `// import "../api";\nconst text = 'require("../api")'; /* export * from "../api"; */`,
])("accepts explicit type-only dependency or non-code text: %s", source => {
  expect(runtimeApiDependencies(source)).toEqual([]);
});

it.each([
  'import { Shape } from "../api";',
  'import Shape from "../api";',
  'import * as Domain from "../api";',
  'import "../api";',
  'import {} from "../api";',
  'import { type DocumentQuery, Shape } from "../api";',
  'import Shape, { type DocumentQuery } from "../api";',
  'export { Shape } from "../api";',
  'export * from "../api";',
  'export * as Domain from "../api";',
  'export {} from "../api";',
  'export { type DocumentQuery, Shape } from "../api";',
  'import Domain = require("../api");',
  'const domain = require /* comment */ ("../api");',
  'async function load() { return import /* comment */ ("../api"); }',
  'const domain = require(`../api`);',
  'const domain = import(`../api`);',
])("rejects model runtime dependency: %s", source => {
  expect(runtimeApiDependencies(source)).toEqual(["../api"]);
});

it("checks api subpaths after path normalization without banning model-local imports", () => {
  expect(runtimeApiDependencies(`
    const a = require("../api/Domain");
    const b = import("../api/../api/Editing");
    import { Shape } from "./Shape";
  `)).toEqual(["../api/Domain", "../api/../api/Editing"]);
});


it("keeps registry test plugins on the public API and the kernel independent of concrete plugin paths", () => {
  const support = resolve(root, "../tests/support");
  for (const name of ["RegistryExtensions.ts", "ContractShapes.ts"]) {
    for (const specifier of dependencies(readFileSync(join(support, name), "utf8"))) {
      const target = resolve(support, specifier);
      expect(target === join(root, "api") || target === join(support, "ContractShapes")).toBe(true);
    }
  }
  for (const path of files(join(root, "extensions"))) {
    for (const specifier of dependencies(readFileSync(path, "utf8"))) {
      expect(specifier).not.toMatch(/plugins|support|services|cli|host/);
    }
  }
});

// Human-authorized correction: platform builtins are not private kernel dependencies.
function pluginDependencyAllowed(specifier: string, path: string, packageRoot: string): boolean {
  if (specifier.startsWith("node:")) return isBuiltin(specifier);
  if (!specifier.startsWith(".")) return false;
  const target = resolve(dirname(path), specifier);
  return target === join(root, "api") || target.startsWith(packageRoot + sep);
}

it("limits plugins to their own package, public API and validated node: builtins", () => {
  const plugins = resolve(root, "../plugins");
  for (const path of files(plugins)) {
    const packageRoot = join(plugins, relative(plugins, path).split(sep)[0]!);
    for (const specifier of dependencies(readFileSync(path, "utf8"))) {
      expect(pluginDependencyAllowed(specifier, path, packageRoot), `${path} -> ${specifier}`).toBe(true);
    }
  }
});

it("forbids concrete default shape dependencies throughout the kernel", () => {
  for (const folder of ["model", "commands", "services", "extensions", "io", "cli"]) {
    for (const path of files(join(root, folder))) {
      const source = readFileSync(path, "utf8");
      for (const dependency of dependencies(source)) expect(dependency, path).not.toMatch(/plugins|ShapeFactory|ShapeSchema|\/(Rectangle|Circle|Ellipse|Line|TextShape|Group)$/);
      expect(source, path).not.toMatch(/new\s+(Group|Rectangle|Circle|Ellipse|Line|TextShape)\s*\(/);
    }
  }
});

it("keeps integration plugin doubles on the public API and local doubles", () => {
  const support = resolve(root,"../tests/support");
  for (const specifier of dependencies(readFileSync(join(support,"WiredExtensions.ts"),"utf8"))) {
    const target=resolve(support,specifier);
    expect(target === join(root,"api") || target === join(support,"ContractShapes")).toBe(true);
  }
});


it.each([
  ["node:fs", true], ["node:fs/promises", true], ["node:path", true], ["node:module", true],
  ["./helper", true], ["../../src/api", true],
  ["node:not-a-real-builtin", false], ["node:fs/../private", false], ["fs", false], ["typescript", false],
  ["../../src/model/Shape", false], ["../../src/host/composition", false], ["../another/index", false],
  ["../../src/api/../services/Editor", false],
])("checks authorized plugin dependency %s → %s", (specifier, expected) => {
  const packageRoot = resolve(root, "../plugins/probe");
  expect(pluginDependencyAllowed(String(specifier), join(packageRoot, "Probe.ts"), packageRoot)).toBe(expected);
});

it("applies the same builtin rule to imports, re-exports, require and dynamic import", () => {
  const source = `import { readFile } from "node:fs";
    export { join } from "node:path";
    const a = require("node:fs/promises");
    const b = import("node:module");`;
  const packageRoot = resolve(root, "../plugins/probe");
  const names = dependencies(source);
  expect(names).toEqual(["node:fs", "node:path", "node:fs/promises", "node:module"]);
  expect(names.every(name => pluginDependencyAllowed(name, join(packageRoot, "Probe.ts"), packageRoot))).toBe(true);
});
