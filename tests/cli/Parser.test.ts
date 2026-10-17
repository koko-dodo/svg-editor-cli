import { describe, expect, it } from "vitest";
import { Parser } from "../../src/cli/Parser";
import { CommandCatalog } from "../../src/cli/CommandCatalog";

const parser = new Parser(new CommandCatalog());
describe("Parser", () => {
  it.each([
    ["init", { kind: "init", width: 800, height: 600 }],
    ["init 400", { kind: "init", width: 400, height: 600 }],
    ["init 400 200", { kind: "init", width: 400, height: 200 }],
    ["canvas", { kind: "canvas", size: null }],
    ["canvas 400 200", { kind: "canvas", size: { width: 400, height: 200 } }],
    ["delete r", { kind: "delete", id: "r" }],
    ["move R -1.5 +2e1", { kind: "move", id: "R", dx: -1.5, dy: 20 }],
    ["scale r .5", { kind: "scale", id: "r", factor: 0.5 }],
    ['set t text "hello world"', { kind: "set", id: "t", attribute: "text", value: "hello world" }],
    ["group g b a", { kind: "group", id: "g", members: ["b", "a"] }],
    ["ungroup g", { kind: "ungroup", id: "g" }],
    ["addto g r", { kind: "addto", groupId: "g", id: "r" }],
    ["front r", { kind: "front", id: "r" }], ["back r", { kind: "back", id: "r" }],
    ["tree", { kind: "tree", id: undefined }], ["tree g", { kind: "tree", id: "g" }],
    ["show r", { kind: "show", id: "r" }], ["help", { kind: "help" }],
    ["undo", { kind: "undo" }], ["redo", { kind: "redo" }],
    ['read "my file.svg"', { kind: "read", path: "my file.svg" }],
    ["save", { kind: "save", path: undefined }], ["save demo.svg", { kind: "save", path: "demo.svg" }],
  ])("parses %s", (line, expected) => {
    expect(parser.parse(line as string)).toEqual(expected);
  });

  it.each([
    ["rect r 1 2 3 4 #abc", { type: "rect", id: "r", x: 1, y: 2, width: 3, height: 4, fill: "#abc" }],
    ["circle c 1 2 3 red", { type: "circle", id: "c", cx: 1, cy: 2, r: 3, fill: "red" }],
    ["ellipse e 1 2 3 4 blue", { type: "ellipse", id: "e", cx: 1, cy: 2, rx: 3, ry: 4, fill: "blue" }],
    ["line l 1 2 3 4 black", { type: "line", id: "l", x1: 1, y1: 2, x2: 3, y2: 4, stroke: "black" }],
    ['text t 1 2 "hello world"', { type: "text", id: "t", x: 1, y: 2, text: "hello world" }],
    ["g g", { type: "g", id: "g" }],
  ])("parses create %s at root and with in", (source, request) => {
    expect(parser.parse(`create ${source}`)).toEqual({ kind: "create", request });
    expect(parser.parse(`create ${source} in parent`)).toEqual({ kind: "create", request: { ...(request as object), parentId: "parent" } });
  });

  it.each(["rect r 1 2 3 4", "circle c 1 2 3", "ellipse e 1 2 3 4", "line l 1 2 3 4"])("does not materialize omitted style for %s", source => {
    const parsed = parser.parse(`create ${source} in p`);
    expect(parsed?.kind).toBe("create");
    if (parsed?.kind !== "create") throw new Error("expected create");
    expect(parsed.request).not.toHaveProperty("fill");
    expect(parsed.request).not.toHaveProperty("stroke");
    expect(parsed.request.parentId).toBe("p");
  });

  it("keeps empty content and quoted in as positional data", () => {
    expect(parser.parse('create text t 1 2 ""')).toMatchObject({ request: { text: "" } });
    expect(parser.parse('create text t 1 2 "in" in g')).toMatchObject({ request: { text: "in", parentId: "g" } });
    expect(parser.parse('create rect r 1 2 3 4 "in"')).toMatchObject({ request: { fill: "in" } });
    expect(parser.parse('create text t 1 2 "x in y"')).toMatchObject({ request: { text: "x in y" } });
  });

  it.each([
    "init 1 2 3", "canvas 400", "canvas 1 2 3", "create", "create rect", "create rect r 1 2 3",
    "create rect r 1 2 3 4 red blue", "create text t 1 2 hello world", "create text t 1 2 hi red",
    "create g g extra", "create g g in", "create g g in a in b", "create circle c 1 2 3 in",
    "create text t 1 2 hi in", "delete", "delete a b", "move r 1", "move r 1 2 3", "scale r",
    "set r fill", "set r fill red blue", "group g", "ungroup", "addto g", "front", "back a b",
    "tree a b", "show", "help extra", "undo extra", "redo extra", "read", "save a b",
    "create rect r 1 2 3 4 #abc # comment",
  ])("rejects invalid arity/suffix %s", source => {
    expect(() => parser.parse(source)).toThrow("usage:");
  });

  it.each(["NaN", "Infinity", "-Infinity", "1e309", "12px", "0x10", '""', '" "', "1.2.3"])("rejects numeric token %s", value => {
    expect(() => parser.parse(`move r ${value} 1`)).toThrow("invalid number");
    expect(() => parser.parse(`create circle c 0 0 ${value}`)).toThrow("invalid number");
  });
  it("passes domain-invalid finite numbers to Editor validation", () => {
    expect(parser.parse("scale r 0")).toMatchObject({ factor: 0 });
  });
  it("rejects unknown commands/types and preserves case", () => {
    expect(() => parser.parse("HELP")).toThrow("unknown command: HELP");
    expect(() => parser.parse("create box b")).toThrow("unknown shape type: box (is the plugin loaded?)");
    expect(parser.parse("move R 1 2")).toMatchObject({ id: "R" });
  });
});
