import type { CommandInvocation, CommandToken } from "../api";
import type { ExtensionRegistry } from "../extensions/ExtensionRegistry";
import type { ParsedCommand } from "./ParsedCommand";

/** Only a copied observation leaves the catalog, never a plan's captured arguments. */
function observation(value: unknown, active = new Set<object>()): unknown {
  if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))) return value;
  if (typeof value !== "object" || active.has(value)) throw new Error("invalid command request data");
  active.add(value);
  try {
    if (Array.isArray(value)) return Object.freeze(value.map(item => observation(item, active)));
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new Error("invalid command request data");
    }
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, observation(item, active)])));
  } finally { active.delete(value); }
}

/** Generic registration dispatch. Grammar, help and execution belong to extensions. */
export class CommandCatalog {
  private readonly plans = new WeakMap<ParsedCommand, CommandInvocation>();
  constructor(readonly registry: ExtensionRegistry) {}

  parse(tokens: readonly CommandToken[]): ParsedCommand | null {
    if (!tokens.length) return null;
    const name = tokens[0]!.value;
    const command = this.registry.command(name);
    if (!command) throw new Error(`unknown command: ${name}`);
    const plan = command.parse(tokens.slice(1), this.registry.shapeServices());
    if (plan !== null && typeof plan === "object" && "then" in plan) {
      void Promise.resolve(plan).catch(() => {});
      throw new Error("command parsing must be synchronous");
    }
    if (!plan || typeof plan.execute !== "function" || !["query", "edit", "host"].includes(plan.mode)) {
      throw new Error("invalid command invocation");
    }
    const request = Object.freeze({ ...observation(plan.request) as Readonly<Record<string, unknown>>, kind: name });
    this.plans.set(request, Object.freeze({ ...plan, execute: plan.execute.bind(plan) }) as CommandInvocation);
    return request;
  }

  invocation(request: ParsedCommand): CommandInvocation {
    const plan = this.plans.get(request);
    if (!plan) throw new Error("unknown command invocation");
    return plan;
  }

  help(): readonly string[] {
    return [...this.registry.contributions().commands.map(name => this.registry.command(name)!.syntax),
      "", "Create parameters:", ...this.registry.shapeServices().createHelp()];
  }
}
