import { readFileSync } from "node:fs";
import type { PluginValue } from "../../api";
import { copyValue, record } from "./PluginData";

export interface PluginEntry {
  readonly module: string;
  readonly enabled?: boolean;
  readonly options?: PluginValue;
}

/** Validate the entire configuration before resolving/evaluating any entry. */
export function readConfig(path: string): readonly PluginEntry[] {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!record(value) || Object.keys(value).some(key => key !== "plugins") || !Array.isArray(value.plugins)) throw new Error("invalid plugin config");
  const entries = value.plugins.map((entry: unknown): PluginEntry => {
    if (!record(entry) || Object.keys(entry).some(key => !["module", "enabled", "options"].includes(key))
      || typeof entry.module !== "string" || !entry.module.trim()
      || (entry.enabled !== undefined && typeof entry.enabled !== "boolean")) throw new Error("invalid plugin config");
    return Object.freeze({ module: entry.module,
      ...(entry.enabled === undefined ? {} : { enabled: entry.enabled }),
      ...(Object.hasOwn(entry, "options") ? { options: copyValue(entry.options) } : {}),
    });
  });
  return Object.freeze(entries);
}
