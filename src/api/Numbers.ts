import type { CommandToken } from "./Command";
/** Shared lexical validation; domain ranges remain in Shape implementations. */
export function parseNumberToken(token: CommandToken, name: string): number {
  const value = token.value;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value))) {
    throw new Error(`invalid number for ${name}: ${JSON.stringify(value)}`);
  }
  return Number(value);
}
export function parseSvgNumber(value: string | null, name: string): number {
  if (value === null || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()) || !Number.isFinite(Number(value))) {
    throw new Error(`invalid numeric SVG attribute: ${name}`);
  }
  return Number(value);
}
