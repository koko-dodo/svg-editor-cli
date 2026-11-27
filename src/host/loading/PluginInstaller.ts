import type { PluginManifest, PluginModule, PluginValue } from "../../api";
import type { ExtensionRegistry } from "../../extensions/ExtensionRegistry";
import { copyValue, describe, manifest, reason } from "./PluginData";

export interface CodePlugin {
  /** Diagnostic identity only; no module resolution in code assembly. */
  readonly module: string;
  readonly manifest: PluginManifest;
  readonly exports: { readonly default: PluginModule };
  readonly options?: PluginValue;
}

/** Both assembly modes use this one validation and Registry atomic commit path. */
export class PluginInstaller {
  constructor(private readonly registry: ExtensionRegistry) {}

  install(module: string, metadata: unknown, exports: unknown, options?: unknown): string | undefined {
    let name = reason(module), activationFailed = false, mismatch: string | undefined;
    try {
      const declared = manifest(metadata);
      name = declared.name;
      if ((typeof exports !== "object" && typeof exports !== "function") || exports === null || !Object.hasOwn(exports, "default")) {
        return `error: plugin has no default export: ${reason(module)}`;
      }
      const plugin: unknown = (exports as { default: unknown }).default;
      if (plugin === null || (typeof plugin !== "object" && typeof plugin !== "function") || typeof (plugin as PluginModule).activate !== "function") {
        throw new Error("invalid plugin default export");
      }
      const activate = (plugin as PluginModule).activate;
      const input = options === undefined ? undefined : copyValue(options);
      this.registry.register(context => {
        try { return activate.call(plugin, context, input); }
        catch (error) { activationFailed = true; throw error; }
      }, registered => {
        if (describe(declared.contributes) !== describe(registered)) {
          mismatch = `error: plugin manifest mismatch: ${name} (declared: ${describe(declared.contributes)}, registered: ${describe(registered)})`;
          throw new Error("plugin manifest mismatch");
        }
      });
      return undefined;
    } catch (error) {
      if (mismatch) return mismatch;
      const message = reason(error);
      if (!activationFailed && /^duplicate registration: (shapes|commands|decorators|attributes)\//.test(message)) return `error: ${message}`;
      return `error: plugin failed to activate: ${name} (${message})`;
    }
  }

  installCode(plugins: readonly CodePlugin[]): readonly string[] {
    const errors: string[] = [];
    for (const plugin of plugins) {
      const error = this.install(plugin.module, plugin.manifest, plugin.exports, plugin.options);
      if (error) errors.push(error);
    }
    return Object.freeze(errors);
  }
}
