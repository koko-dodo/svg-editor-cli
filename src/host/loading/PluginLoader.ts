import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { PluginInstaller } from "./PluginInstaller";
import { readConfig } from "./PluginConfig";
import { manifest, reason } from "./PluginData";

/** Nearest package owns the entry, including packages whose main is under dist/. */
function readManifest(entry: string): unknown {
  if (!isAbsolute(entry)) throw new Error("invalid plugin manifest");
  let directory = dirname(entry);
  for (;;) {
    const file = join(directory, "package.json");
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
    const parent = dirname(directory);
    if (parent === directory) throw new Error("invalid plugin manifest");
    directory = parent;
  }
}

/** Generic runtime string loading. No concrete plugin imports or name mappings. */
export class PluginLoader {
  constructor(private readonly installer: PluginInstaller) {}

  loadFile(configFile: string): readonly string[] {
    const file = resolve(configFile);
    let entries;
    try { entries = readConfig(file); }
    catch { return Object.freeze(["error: invalid plugin config"]); }
    const requireFromConfig = createRequire(join(dirname(file), ".svg-plugin-loader.cjs"));
    const errors: string[] = [];
    for (const entry of entries) {
      if (entry.enabled === false) continue;
      let resolved: string;
      try { resolved = requireFromConfig.resolve(entry.module); }
      catch (error) {
        errors.push((error as NodeJS.ErrnoException)?.code === "MODULE_NOT_FOUND"
          ? `error: plugin not found: ${reason(entry.module)}`
          : `error: plugin failed to activate: ${reason(entry.module)} (${reason(error)})`);
        continue;
      }
      let name = reason(entry.module);
      try {
        const metadata = manifest(readManifest(resolved));
        name = metadata.name;
        // Resolution succeeded already. ANY evaluation/dependency error is activation failure.
        const exports: unknown = requireFromConfig(resolved);
        const error = this.installer.install(entry.module, metadata, exports, entry.options);
        if (error) errors.push(error);
      } catch (error) {
        errors.push(`error: plugin failed to activate: ${name} (${reason(error)})`);
      }
    }
    return Object.freeze(errors);
  }
}
