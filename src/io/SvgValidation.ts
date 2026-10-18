/** Limits apply equally to imports and exports, keeping saved files readable. */
export class SvgValidation {
  static readonly namespace = "http://www.w3.org/2000/svg";
  static readonly maxBytes = 1024 * 1024;
  static readonly maxDepth = 128;
  static readonly maxElements = 10000;
  static number(value: string | null, name: string): number {
    if (value === null || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()) || !Number.isFinite(Number(value))) {
      throw new Error(`invalid numeric SVG attribute: ${name}`);
    }
    return Number(value);
  }
  static characters(value: string): void {
    for (const character of value) {
      const code = character.codePointAt(0)!;
      if (!(code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff))) {
        throw new Error("invalid XML character");
      }
    }
  }
  static paint(value: string): void {
    // Deliberately limited to literal colors/keywords. No URLs, CSS escapes or variables.
    if (!/^(?:[a-zA-Z]+|#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%+\- /]+\))$/.test(value.trim())) {
      throw new Error(`unsupported SVG paint: ${value}`);
    }
  }
  static size(xml: string): void {
    if (Buffer.byteLength(xml, "utf8") > this.maxBytes) throw new Error("SVG file exceeds size limit");
    this.characters(xml);
  }
}
