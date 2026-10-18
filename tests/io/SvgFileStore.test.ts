import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SvgFileStore } from "../../src/io/SvgFileStore";
import { SvgDocument } from "../../src/model/SvgDocument";

let directory: string;
beforeEach(async () => { directory = await fs.mkdtemp(join(tmpdir(), "svg-store-")); });
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });
describe("SvgFileStore", () => {
  it("writes standard SVG and reads it from a path containing spaces", async () => {
    const store = new SvgFileStore(); const path = join(directory, "test file.svg");
    expect(await store.save(path, new SvgDocument(400, 300))).toEqual({ path, elements: 0 });
    expect((await store.read(path)).document.width).toBe(400);
    expect(await fs.readdir(directory)).toEqual(["test file.svg"]);
  });
  it("preserves the existing target and removes temporary files on rename failure", async () => {
    const path = join(directory, "original.svg"); await fs.writeFile(path, "original");
    const store = new SvgFileStore({ ...fs, rename: vi.fn().mockRejectedValue(new Error("denied")) });
    await expect(store.save(path, new SvgDocument())).rejects.toThrow(`cannot write file: ${path}`);
    expect(await fs.readFile(path, "utf8")).toBe("original");
    expect(await fs.readdir(directory)).toEqual(["original.svg"]);
  });
  it("cleans up after a partial write failure", async () => {
    const open: typeof fs.open = async (...args) => {
      const handle = await fs.open(...args);
      vi.spyOn(handle, "writeFile").mockRejectedValue(new Error("disk full"));
      return handle;
    };
    await expect(new SvgFileStore({ ...fs, open }).save(join(directory, "fail.svg"), new SvgDocument())).rejects.toThrow("cannot write file");
    expect(await fs.readdir(directory)).toEqual([]);
  });
  it("reports missing/unwritable paths and rejects invalid UTF-8", async () => {
    const store = new SvgFileStore();
    await expect(store.read(join(directory, "missing"))).rejects.toThrow("cannot read file");
    await expect(store.save(join(directory, "missing", "out.svg"), new SvgDocument())).rejects.toThrow("cannot write file");
    const path = join(directory, "bad.svg"); await fs.writeFile(path, Buffer.from([0xff]));
    await expect(store.read(path)).rejects.toThrow();
  });
});
