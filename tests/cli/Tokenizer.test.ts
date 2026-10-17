import { describe, expect, it } from "vitest";
import { Tokenizer } from "../../src/cli/Tokenizer";

const tokenizer = new Tokenizer();
describe("Tokenizer", () => {
  it.each(["", "   \t", "# comment", " \t # ignored \"quote"])("ignores blank/comment line %j", line => {
    expect(tokenizer.tokenize(line)).toEqual([]);
  });
  it("preserves spaces, empty text, Chinese and color values", () => {
    const tokens = tokenizer.tokenize('create text t 1 2 "你好 world" "" #ff00aa');
    expect(tokens.map(token => token.value)).toEqual(["create", "text", "t", "1", "2", "你好 world", "", "#ff00aa"]);
    expect(tokens[5]).toMatchObject({ quoted: true });
    expect(tokens[7]).toMatchObject({ quoted: false });
    expect(Object.isFrozen(tokens)).toBe(true);
  });
  it("decodes only quote/backslash escapes inside double quotes", () => {
    const token = tokenizer.tokenize(String.raw`"a\"b\\c\q\n"`)[0]!;
    expect(token.value).toBe('a"b\\c\\q\\n');
    expect(tokenizer.tokenize(String.raw`C:\folder\file`)[0]!.value).toBe(String.raw`C:\folder\file`);
  });
  it("does not give single quotes or inline comments shell semantics", () => {
    expect(tokenizer.tokenize("'a b' # comment").map(token => token.value)).toEqual(["'a", "b'", "#", "comment"]);
  });
  it.each(['"unclosed', 'a"b"', '"a"b'])("rejects malformed quoting %s", line => {
    expect(() => tokenizer.tokenize(line)).toThrow();
  });
  it("records token columns", () => {
    expect(tokenizer.tokenize('  move  "r 1"').map(token => token.column)).toEqual([3, 9]);
  });
});
