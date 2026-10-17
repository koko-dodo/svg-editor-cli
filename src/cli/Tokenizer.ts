export interface Token {
  readonly value: string;
  readonly quoted: boolean;
  readonly column: number;
}

export class Tokenizer {
  tokenize(line: string): readonly Token[] {
    if (line.trimStart().startsWith("#")) return [];
    const tokens: Token[] = [];
    let i = 0;
    while (i < line.length) {
      if (/\s/.test(line[i]!)) { i++; continue; }
      const column = i + 1;
      const quoted = line[i] === '"';
      let value = "";
      if (quoted) {
        i++;
        let closed = false;
        while (i < line.length) {
          const char = line[i++]!;
          if (char === '"') { closed = true; break; }
          if (char === "\\" && (line[i] === '"' || line[i] === "\\")) value += line[i++]!;
          else value += char;
        }
        if (!closed) throw new Error(`unterminated quote at column ${column}`);
        if (i < line.length && !/\s/.test(line[i]!)) throw new Error(`expected whitespace at column ${i + 1}`);
      } else {
        while (i < line.length && !/\s/.test(line[i]!)) {
          if (line[i] === '"') throw new Error(`unexpected quote at column ${i + 1}`);
          value += line[i++]!;
        }
      }
      tokens.push(Object.freeze({ value, quoted, column }));
    }
    return Object.freeze(tokens);
  }

  /** Complete finite decimal tokens only; model methods validate domain ranges. */
  static number(token: Token, name: string): number {
    const value = token.value;
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value))) {
      throw new Error(`invalid number for ${name}: ${JSON.stringify(value)}`);
    }
    return Number(value);
  }
}
