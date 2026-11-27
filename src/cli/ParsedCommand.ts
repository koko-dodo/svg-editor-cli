/** Opaque parsed values; execution plans are owned by the catalog, not serialized. */
export interface ParsedCommand { readonly kind: string; readonly [key: string]: unknown }
