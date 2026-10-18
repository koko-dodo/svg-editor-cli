import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "../../src/services/Editor";
import { SvgFileStore } from "../../src/io/SvgFileStore";

let directory: string; let source: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(join(tmpdir(), "svg-editor-")); source = join(directory, "source.svg");
  await fs.writeFile(source, '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><g id="scene"/></svg>');
});
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });
const state = (e: Editor) => ({ view: e.tree(), history: e.getStatus() });
describe("Editor IO", () => {
  it("uses only the latest successful read as default and clears it after init", async () => {
    const e = new Editor(); e.init();
    await expect(e.save()).rejects.toThrow("no default save path");
    const other = join(directory, "other.svg");
    await e.save(other); await expect(e.save()).rejects.toThrow("no default save path");
    await e.read(source); e.create({ type: "g", id: "a" }); await e.save(other);
    expect((await e.save()).path).toBe(source);
    expect(await fs.readFile(source, "utf8")).toContain('id="a"');
    await e.read(other); expect((await e.save()).path).toBe(other);
    expect(() => e.init(-1)).toThrow(); expect((await e.save()).path).toBe(other);
    e.init(); await expect(e.save()).rejects.toThrow("no default save path");
  });
  it("read/save set barriers; failed reads and writes preserve document, redo and default", async () => {
    const e = new Editor(); await e.read(source);
    expect(() => e.undo()).toThrow("undo not allowed after io command");
    e.create({ type: "g", id: "a" }); e.move("a", 1, 2); e.undo();
    const before = state(e);
    await expect(e.read(join(directory, "missing"))).rejects.toThrow("cannot read file");
    await fs.writeFile(join(directory, "bad.svg"), '<svg>');
    await expect(e.read(join(directory, "bad.svg"))).rejects.toThrow();
    await expect(e.save(join(directory, "missing", "out.svg"))).rejects.toThrow("cannot write file");
    expect(state(e)).toEqual(before); e.redo();
    expect((await e.save()).path).toBe(source);
    expect(() => e.redo()).toThrow("undo not allowed after io command");
    e.create({ type: "g", id: "b" }); e.undo(); expect(e.getStatus().canRedo).toBe(true);
    await e.read(source); expect(e.getStatus().isBlocked).toBe(true);
  });
  it.each(["read", "save"] as const)("blocks every mutation and second IO during %s; queries see committed state", async operation => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const store = new SvgFileStore();
    const files = {
      read: vi.fn(async (path: string) => { await gate; return store.read(path); }),
      save: vi.fn(async (...args: Parameters<SvgFileStore["save"]>) => { await gate; return store.save(...args); }),
    };
    const e = new Editor(files); e.init(); e.create({ type: "g", id: "g" });
    const before = state(e);
    const pending = operation === "read" ? e.read(source) : e.save(join(directory, "save.svg"));
    for (const edit of [() => e.init(), () => e.resizeCanvas(1, 1), () => e.create({ type: "g", id: "x" }),
      () => e.delete("g"), () => e.move("g", 1, 1), () => e.scale("g", 2), () => e.setAttribute("g", "fill", "red"),
      () => e.group("x", ["g"]), () => e.ungroup("g"), () => e.addTo("g", "x"), () => e.front("g"), () => e.back("g"), () => e.undo(), () => e.redo()]) expect(edit).toThrow("busy");
    await expect(e.read(source)).rejects.toThrow("busy"); await expect(e.save(source)).rejects.toThrow("busy");
    expect(state(e)).toEqual(before); expect(e.show("g").id).toBe("g"); expect(e.getCanvas().width).toBe(800);
    release(); await pending; e.create({ type: "g", id: "after" });
  });
  it("releases busy state after failure and retains a preexisting barrier", async () => {
    const files = { read: vi.fn().mockRejectedValue(new Error("failed")), save: vi.fn().mockRejectedValue(new Error("failed")) };
    const e = new Editor(files); e.init(); const before = state(e);
    await expect(e.read(source)).rejects.toThrow("failed"); await expect(e.save(source)).rejects.toThrow("failed");
    expect(state(e)).toEqual(before); e.create({ type: "g", id: "ok" });
  });
});
