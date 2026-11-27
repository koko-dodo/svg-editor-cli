import type { ContributionNames, PluginManifest, PluginValue } from "../../api";

export const categories = ["shapes", "commands", "decorators", "attributes"] as const;
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

/** Detached JSON only; no options reference is shared with activation. */
export function copyValue(value: unknown, active = new Set<object>()): PluginValue {
  if (value === null || typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))) return value;
  if (typeof value !== "object" || active.has(value)) throw new Error("invalid plugin options");
  active.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) throw new Error("invalid plugin options");
      return Object.freeze(value.map(item => copyValue(item, active)));
    }
    if (!record(value)) throw new Error("invalid plugin options");
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyValue(item, active)])));
  } finally { active.delete(value); }
}

export function manifest(value: unknown): PluginManifest & { readonly contributes: ContributionNames } {
  if (!record(value) || typeof value.name !== "string" || !value.name || /\s/.test(value.name)) throw new Error("invalid plugin manifest");
  const raw = value.contributes === undefined ? {} : value.contributes;
  if (!record(raw) || Object.keys(raw).some(key => !categories.includes(key as typeof categories[number]))) throw new Error("invalid plugin manifest");
  const contributes = Object.fromEntries(categories.map(category => {
    const names = raw[category] === undefined ? [] : raw[category];
    if (!Array.isArray(names) || !Array.from(names).every(name => typeof name === "string" && name.length > 0 && !/\s/.test(name))
      || new Set(names).size !== names.length) throw new Error("invalid plugin manifest");
    return [category, Object.freeze([...names])];
  })) as unknown as ContributionNames;
  return Object.freeze({ name: value.name, contributes: Object.freeze(contributes) });
}

/** Fixed category order, locale-independent name order; diagnostics are deterministic. */
export function describe(names: ContributionNames): string {
  return JSON.stringify(Object.fromEntries(categories.map(category => [category, [...names[category]].sort()])));
}
export function reason(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}
