import { describe, expect, it } from "vitest";
import { Editor } from "../../src/services/Editor";
import { CommandCatalog } from "../../src/cli/CommandCatalog";
import { Dispatcher } from "../../src/cli/Dispatcher";
import { Parser } from "../../src/cli/Parser";

function harness() {
  const editor = new Editor();
  const catalog = new CommandCatalog();
  const parser = new Parser(catalog);
  const dispatcher = new Dispatcher(editor, catalog);
  const run = (line: string) => dispatcher.execute(parser.parse(line)!);
  return { editor, run };
}

describe("Dispatcher and catalog feedback", () => {
  it("supports help without a document and uses catalog syntax", () => {
    const { editor, run } = harness();
    const help = run("help").join("\n");
    for (const name of ["init", "canvas", "create", "delete", "move", "scale", "set", "group", "ungroup", "addto", "front", "back", "tree", "show", "help", "undo", "redo", "read", "save"]) {
      expect(help).toContain(name);
    }
    expect(help).toContain("Task 7");
    expect(editor.getStatus().hasDocument).toBe(false);
  });
  it("matches example move/set/delete feedback and real undo/redo states", () => {
    const { run } = harness();
    expect(run("init 400")).toEqual(["canvas 400x600 created"]);
    expect(run("create g markers")).toEqual(["g#markers created"]);
    expect(run("create circle c1 100 100 20 red in markers")).toEqual(["circle#c1 created in g#markers"]);
    expect(run("move c1 30 0")).toEqual(["circle#c1 moved to (130,100)"]);
    expect(run("undo")).toEqual(["circle#c1 moved back to (100,100)"]);
    expect(run("redo")).toEqual(["circle#c1 moved to (130,100)"]);
    run('create text title 20 40 "My Diagram"');
    expect(run('set title text "My Diagram v2"')).toEqual(['text#title updated: text="My Diagram v2"']);
    expect(run("undo")).toEqual(['text#title updated: text="My Diagram"']);
    expect(run("delete c1")).toEqual(["circle#c1 deleted"]);
    expect(run("undo")).toEqual(["circle#c1 restored into g#markers"]);
    expect(run("redo")).toEqual(["circle#c1 deleted"]);
  });
  it("reports group movement and restoring previously absent styles", () => {
    const { run } = harness();
    run("init"); run("create g node"); run("create rect r 1 2 3 4 in node");
    expect(run("move node 0 100")).toEqual(["g#node moved by (0,100)"]);
    expect(run("undo")).toEqual(["g#node moved back by (0,-100)"]);
    run("set node fill red");
    expect(run("undo")).toEqual(["g#node updated: fill=<unset>"]);
  });
  it("provides success and reversal feedback for every structural command", () => {
    const { editor, run } = harness();
    run("init"); run("create g scene"); run("create rect r 1 2 3 4 in scene"); run("create circle c 1 2 3 in scene");
    expect(run("group joined c r")).toEqual(["g#joined created with 2 children"]);
    expect(run("undo")[0]).toContain("grouping undone"); run("redo");
    expect(run("ungroup joined")).toEqual(["g#joined ungrouped"]);
    expect(run("undo")).toEqual(["g#joined restored into g#scene with 2 children"]); run("redo");
    run("create g dest");
    expect(run("addto dest r")).toEqual(["rect#r moved into g#dest"]);
    expect(run("undo")).toEqual(["rect#r restored into g#scene"]);
    expect(run("front r")).toEqual(["rect#r moved to front"]);
    expect(editor.tree("scene").children.map(node => node.id)).toEqual(["c", "r"]);
    expect(run("undo")).toEqual(["rect#r z-order restored"]);
    expect(run("back c")).toEqual(["circle#c moved to back"]);
    expect(editor.tree("scene").children.map(node => node.id)).toEqual(["c", "r"]);
    expect(run("scale scene 2")).toEqual(["g#scene scaled by 2"]);
    expect(run("undo")).toEqual(["g#scene scale undone; geometry restored"]);
  });
  it("undoes creation and reports disappearance instead of creation success", () => {
    const { run } = harness(); run("init"); run("create g g");
    expect(run("undo")).toEqual(["g#g deleted"]);
    expect(run("redo")).toEqual(["g#g created"]);
  });
  it("handles canvas query/resize and enforces history barriers", () => {
    const { editor, run } = harness(); run("init"); run("create g g");
    const before = editor.getStatus();
    expect(run("canvas")).toEqual(["canvas 800x600"]);
    expect(editor.getStatus()).toEqual(before);
    expect(run("canvas 200 300")).toEqual(["canvas 200x300 resized"]);
    expect(() => run("undo")).toThrow("undo not allowed after io command");
  });
  it.each([
    ["create g r", "id already exists: r"],
    ["move missing 1 2", "no such shape: missing"],
    ["create g new in missing", "no such container: missing"],
    ["create g new in r", "not a container: r"],
    ["create box b", "unknown shape type: box (is the plugin loaded?)"],
    ["ungroup scene", "cannot ungroup top-level container: scene"],
    ["group bad scene r", "cannot group a container into its own descendant: scene"],
    ["scale r 0", "scale factor must be positive"],
    ["set r opacity 1", "unknown attribute: opacity"],
  ])("preserves specified error for %s and retains document/history", (source, error) => {
    const { editor, run } = harness(); run("init"); run("create g scene"); run("create rect r 1 2 3 4 in scene"); run("move r 1 2"); run("undo");
    const before = { tree: editor.tree(), history: editor.getStatus() };
    expect(() => run(source)).toThrow(error);
    expect({ tree: editor.tree(), history: editor.getStatus() }).toEqual(before);
    run("redo"); expect(editor.show("r").attributes.x).toBe(2);
  });
  it("IO notices are not edits, errors, or history barriers", () => {
    const { editor, run } = harness(); run("init"); run("create g g"); run("undo");
    const before = { tree: editor.tree(), history: editor.getStatus() };
    expect(run('read "other file.svg"')[0]).toContain("Task 7");
    expect(run("save")[0]).toContain("Task 7");
    expect({ tree: editor.tree(), history: editor.getStatus() }).toEqual(before);
  });
});
