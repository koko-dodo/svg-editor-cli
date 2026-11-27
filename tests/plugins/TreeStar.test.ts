import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import type { DocumentView, ShapeView } from "../../src/api";
import { ModifiedStarDecorator } from "../../plugins/tree-star/ModifiedStarDecorator";
import * as star from "../../plugins/tree-star";
import * as box from "../../plugins/shape-box";
import { defaultRegistry, createEditor } from "../../src/host/composition";
import { PluginInstaller } from "../../src/host/loading/PluginInstaller";
import { CommandCatalog } from "../../src/cli/CommandCatalog";
import { Parser } from "../../src/cli/Parser";
import { Dispatcher } from "../../src/cli/Dispatcher";
import { Formatter } from "../../src/cli/Formatter";

const paths: string[] = [];
afterEach(async () => { for (const path of paths.splice(0)) await fs.rm(path, { recursive: true, force: true }); });
async function directory() { const path = await fs.mkdtemp(join(tmpdir(), "svg-star-")); paths.push(path); return path; }
function fixture(order = ["star"]) {
  const registry = defaultRegistry(), installer = new PluginInstaller(registry);
  for (const name of order) {
    const plugin = name === "star" ? star : box;
    const metadata = name === "star"
      ? { name, contributes: { decorators: ["modified-star"] } }
      : { name, contributes: { shapes: ["box"], attributes: ["box-attributes"], decorators: ["box-type-label"] } };
    const error = installer.install(name, metadata, plugin);
    if (error) throw new Error(error);
  }
  const editor = createEditor(registry), catalog = new CommandCatalog(registry), parser = new Parser(catalog);
  const dispatcher = new Dispatcher(editor, catalog, new Formatter(registry, () => editor.observation()));
  return { editor, run: (line: string) => dispatcher.execute(parser.parse(line)!),
    tree: () => dispatcher.execute(parser.parse("tree")!) as string[],
    state: () => ({ document: editor.tree(), status: editor.getStatus(), observation: editor.observation() }) };
}
function starred(lines: string[]) { return lines.filter(line => line.endsWith(" *")); }

it("tracks init, save, same-value edits, edit, undo to baseline and redo without mutating history", async () => {
  const f = fixture(), file = join(await directory(), "saved.svg");
  f.run("init"); expect(f.tree()).toEqual(["svg (800x600) *"]);
  f.run("create g outer"); f.run("create g inner in outer"); f.run("create rect leaf 1 2 3 4 in inner"); f.run("create circle sibling 5 6 7");
  expect(starred(f.tree())).toHaveLength(5);
  await f.editor.save(file); expect(starred(f.tree())).toHaveLength(0);
  f.run("set leaf x 1"); expect(starred(f.tree())).toHaveLength(0);
  f.run("set leaf x 10"); const before = f.state();
  expect(starred(f.tree())).toHaveLength(4); expect(f.state()).toEqual(before);
  expect(starred(f.tree()).some(line => line.includes("sibling"))).toBe(false);
  f.run("undo"); expect(starred(f.tree())).toHaveLength(0);
  f.run("redo"); expect(starred(f.tree())).toHaveLength(4);
  f.run("set leaf x 1"); expect(starred(f.tree())).toHaveLength(0);
  await f.editor.save(file); expect(starred(f.tree())).toHaveLength(0);
});

it("marks creation, deletion, reordering and reparenting with ancestor propagation", async () => {
  const f = fixture(), file = join(await directory(), "saved.svg"); f.run("init");
  f.run("create g a"); f.run("create g b"); f.run("create circle x 1 2 3 in a"); f.run("create circle y 1 2 3 in a");
  await f.editor.save(file);
  f.run("create g fresh in a"); expect(starred(f.tree())).toHaveLength(3); f.run("undo"); expect(starred(f.tree())).toHaveLength(0);
  f.run("delete x"); expect(starred(f.tree())).toHaveLength(2); f.run("undo"); expect(starred(f.tree())).toHaveLength(0);
  f.run("front x"); expect(starred(f.tree())).toHaveLength(2); f.run("undo"); expect(starred(f.tree())).toHaveLength(0);
  f.run("addto b x"); expect(starred(f.tree())).toHaveLength(4); f.run("undo"); expect(starred(f.tree())).toHaveLength(0);
});

it("resets baselines on read/init, preserves them on IO failures and marks canvas dimensions", async () => {
  const f = fixture(), dir = await directory(), file = join(dir, "saved.svg");
  f.run("init"); f.run("create circle x 1 2 3"); await f.editor.save(file); f.run("move x 1 0");
  const before = f.state(), lines = f.tree();
  await expect(f.editor.read(join(dir, "missing.svg"))).rejects.toThrow();
  await expect(f.editor.save(join(dir, "absent", "bad.svg"))).rejects.toThrow();
  expect(f.state()).toEqual(before); expect(f.tree()).toEqual(lines);
  await f.editor.read(file); expect(starred(f.tree())).toHaveLength(0);
  f.run("canvas 900 700"); expect(starred(f.tree())).toHaveLength(1);
  await f.editor.save(file); expect(starred(f.tree())).toHaveLength(0);
  f.run("init"); expect(f.tree()).toEqual(["svg (800x600) *"]);
});

it.each([["box", "star"], ["star", "box"]])("combines independent tags in registration order %j", async (...order: string[]) => {
  const f = fixture(order), file = join(await directory(), "box.svg");
  f.run("init"); f.run('create box n 1 2 3 4 "old"');
  expect(f.tree()).toContain(`└── g#n ${order[0] === "box" ? "(box) *" : "* (box)"}`);
  await f.editor.save(file); f.run('set n label "new"');
  expect(starred(f.tree())).toHaveLength(order[0] === "box" ? 3 : 2);
  f.run("undo"); expect(starred(f.tree())).toHaveLength(0); expect(f.tree()).toContain("└── g#n (box)");
});

it("ignores attribute insertion order and compatibility type, but compares semantic metadata and dimensions", () => {
  const decorator = new ModifiedStarDecorator();
  const node: ShapeView = { id: "n", kind: "rect", container: false, type: "Legacy", parentId: null, attributes: { x: 1, y: 2 }, children: [] };
  const saved: DocumentView = { width: 800, height: 600, roots: [node] };
  const check = (current: ShapeView) => decorator.tags({ document: { ...saved, roots: [current] }, saved, node: current });
  expect(check({ ...node, type: "Other", attributes: { y: 2, x: 1 } })).toEqual([]);
  for (const current of [{ ...node, kind: "other" }, { ...node, container: true }, { ...node, parentId: "p" }, { ...node, attributes: { x: 1 } }]) expect(check(current)).toEqual(["*"]);
  expect(decorator.tags({ document: { ...saved, width: 900 }, saved, node: null })).toEqual(["*"]);
  expect(decorator.tags({ document: saved, saved: null, node })).toEqual(["*"]);
  expect(check(node)).toEqual([]); // no previous-call/session state
});

it("loads the real configuration, supports disabling star and preserves no-plugin tree bytes", async () => {
  const root = resolve(__dirname, "../.."), cwd = await directory();
  const input = 'init\ncreate box n 1 2 3 4 "N"\ntree\n';
  const run = (config?: string, text = input) => spawnSync(process.execPath,
    ["--import", require.resolve("tsx"), join(root, "src/main.ts"), ...(config ? ["--config", config] : [])],
    { cwd, input: text, timeout: 15000, env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", TSX_DISABLE_CACHE: "1" } });
  const enabled = run(join(root, "plugins.star.config.json"));
  expect(enabled.status).toBe(0); expect(enabled.stderr).toEqual(Buffer.alloc(0)); expect(enabled.stdout.toString()).toContain("g#n (box) *");
  const metadata = JSON.parse(await fs.readFile(join(root, "plugins.star.config.json"), "utf8"));
  metadata.plugins = metadata.plugins.map((p: { module: string }) => ({ module: resolve(root, p.module), ...(p.module.endsWith("tree-star") ? { enabled: false } : {}) }));
  const disabledPath = join(cwd, "disabled.json"); await fs.writeFile(disabledPath, JSON.stringify(metadata));
  const disabled = run(disabledPath), previous = run(join(root, "plugins.config.json"));
  expect(disabled.status).toBe(previous.status); expect(disabled.stderr).toEqual(previous.stderr); expect(disabled.stdout).toEqual(previous.stdout);
  const plainInput = "init\ncreate circle n 1 2 3\ntree\n", plain = run(undefined, plainInput), off = run(disabledPath, plainInput);
  expect(off.status).toBe(0); expect(off.stderr).toEqual(plain.stderr); expect(off.stdout).toEqual(plain.stdout);
});
