import type { RegistrationContext } from "./Registration";
import type { ContributionNames } from "./Registration";

/** JSON values copied and deep-frozen by the host before activation. */
export type PluginValue = null | boolean | number | string | readonly PluginValue[]
  | { readonly [key: string]: PluginValue };

export interface PluginManifest {
  readonly name: string;
  /** Missing categories declare empty sets. Names are compared as sets. */
  readonly contributes?: Partial<ContributionNames>;
}

/** Default export must be an object/instance implementing synchronous activation. */
export interface PluginModule {
  activate(context: RegistrationContext, options?: PluginValue): void;
}
