import * as fs from "node:fs/promises";
import { resolve, dirname, basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { SvgDocument } from "../model/SvgDocument";
import { SvgReader } from "./SvgReader";
import { SvgWriter } from "./SvgWriter";
import { SvgValidation } from "./SvgValidation";

/** File access is isolated for deterministic failure testing. */
export class SvgFileStore {
  constructor(private readonly files: Pick<typeof fs, "open" | "rename" | "unlink"> = fs) {}

  async read(path: string) {
    const absolutePath = resolve(path);
    let bytes: Buffer;
    try {
      if (!path.trim()) throw new Error("empty path");
      const handle = await this.files.open(absolutePath, "r");
      try {
        bytes = Buffer.alloc(SvgValidation.maxBytes + 1);
        let total = 0;
        while (total < bytes.length) {
          const { bytesRead } = await handle.read(bytes, total, bytes.length - total, null);
          if (!bytesRead) break;
          total += bytesRead;
        }
        bytes = bytes.subarray(0, total);
      } finally { await handle.close(); }
    } catch { throw new Error(`cannot read file: ${path}`); }
    if (bytes.length > SvgValidation.maxBytes) throw new Error("SVG file exceeds size limit");
    const xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ...new SvgReader().read(xml), path, absolutePath };
  }

  async save(path: string, document: SvgDocument) {
    const { xml, elements } = new SvgWriter().write(document);
    const target = resolve(path);
    const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
    let created = false;
    try {
      if (!path.trim()) throw new Error("empty path");
      const handle = await this.files.open(temporary, "wx", 0o600);
      created = true;
      try { await handle.writeFile(xml, "utf8"); } finally { await handle.close(); }
      await this.files.rename(temporary, target);
    } catch {
      if (created) await this.files.unlink(temporary).catch(() => {});
      throw new Error(`cannot write file: ${path}`);
    }
    return Object.freeze({ path, elements });
  }
}
