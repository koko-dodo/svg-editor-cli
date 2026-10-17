import { CommandCatalog } from "./CommandCatalog";
import { Tokenizer } from "./Tokenizer";
import type { ParsedCommand } from "./ParsedCommand";

/** Coordinates lexical and catalog-owned grammar validation before any edit. */
export class Parser {
  constructor(private readonly catalog: CommandCatalog, private readonly tokenizer = new Tokenizer()) {}
  parse(line: string): ParsedCommand | null {
    return this.catalog.parse(this.tokenizer.tokenize(line));
  }
}
