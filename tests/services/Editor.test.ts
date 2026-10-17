import { describe, expect, it } from "vitest";
import { Editor } from "../../src/services/Editor";
import type { CreateRequest, DocumentView, ShapeView } from "../../src/services/EditorTypes";

function fixture(): Editor {
  const editor = new Editor();
  editor.init(400, 300);
  editor.create({ type: "g", id: "scene" });
  editor.create({ type: "g", id: "left", parentId: "scene" });
  editor.create({ type: "g", id: "right", parentId: "scene" });
  editor.create({ type: "rect", id: "r", x: 1, y: 2, width: 3, height: 4, fill: "red", parentId: "left" });
  editor.create({ type: "circle", id: "c", cx: 5, cy: 6, r: 7, parentId: "left" });
  editor.create({ type: "text", id: "t", x: 8, y: 9, text: "hello", parentId: "right" });
  return editor;
}
function state(editor: Editor) {
  return { tree: editor.tree(), status: editor.getStatus() };
}
function ids(editor: Editor, id: string): string[] {
  return editor.tree(id).children.map(child => child.id);
}
function unchanged(editor: Editor, action: () => unknown): void {
  const before = state(editor);
  expect(action).toThrow();
  expect(state(editor)).toEqual(before);
}

const requests: readonly CreateRequest[] = [
  { type: "rect", id: "rect", x: 1, y: 2, width: 3, height: 4, fill: "red" },
  { type: "circle", id: "circle", cx: 1, cy: 2, r: 3 },
  { type: "ellipse", id: "ellipse", cx: 1, cy: 2, rx: 3, ry: 4 },
  { type: "line", id: "line", x1: 1, y1: 2, x2: 3, y2: 4, stroke: "black" },
  { type: "text", id: "text", x: 1, y: 2, text: "hello" },
  { type: "g", id: "group" },
];

// Checked by npm run build; not executed as invalid runtime requests.
function checkCreateRequestTypes(): void {
  // @ts-expect-error Rectangles require height.
  const rectangle: CreateRequest = { type: "rect", id: "r", x: 1, y: 2, width: 3 };
  // @ts-expect-error Circles require r, not width.
  const circle: CreateRequest = { type: "circle", id: "c", cx: 1, cy: 2, width: 3 };
  // @ts-expect-error Ellipses require both radii.
  const ellipse: CreateRequest = { type: "ellipse", id: "e", cx: 1, cy: 2, rx: 3 };
  // @ts-expect-error Lines require both endpoints.
  const line: CreateRequest = { type: "line", id: "l", x1: 1, y1: 2, x2: 3 };
  // @ts-expect-error Text must provide textual content.
  const text: CreateRequest = { type: "text", id: "t", x: 1, y: 2 };
  // @ts-expect-error Empty group creation has no geometry parameters.
  const group: CreateRequest = { type: "g", id: "g", x: 1 };
  // @ts-expect-error parentId must be a string.
  const parent: CreateRequest = { type: "g", id: "g", parentId: 1 };
  // @ts-expect-error Unknown types are not part of the discriminated union.
  const unknown: CreateRequest = { type: "box", id: "b" };
  void [rectangle, circle, ellipse, line, text, group, parent, unknown];
}
void checkCreateRequestTypes;

describe("Editor", () => {
  it("starts empty and exposes only read-only history status", () => {
    const editor = new Editor();
    expect(editor.getStatus()).toEqual({ hasDocument: false, canUndo: false, canRedo: false, isBlocked: false });
    expect(Object.isFrozen(editor.getStatus())).toBe(true);
    for (const action of [
      () => editor.getCanvas(), () => editor.resizeCanvas(1, 2), () => editor.tree(), () => editor.show("r"),
      () => editor.create({ type: "g", id: "g" }), () => editor.delete("r"), () => editor.move("r", 1, 2),
      () => editor.scale("r", 2), () => editor.setAttribute("r", "fill", "red"),
      () => editor.group("g", ["r"]), () => editor.ungroup("g"), () => editor.addTo("g", "r"),
      () => editor.front("r"), () => editor.back("r"), () => editor.undo(), () => editor.redo(),
    ]) expect(action).toThrow("no document. use 'init' or 'read' first");
    expect("read" in editor).toBe(false);
    expect("save" in editor).toBe(false);
  });

  it("initializes default or explicit dimensions and sets a history barrier", () => {
    const editor = new Editor();
    const size = editor.init();
    expect(size).toEqual({ width: 800, height: 600 });
    expect(Object.isFrozen(size)).toBe(true);
    expect(editor.tree()).toEqual({ width: 800, height: 600, roots: [] });
    expect(editor.getStatus()).toEqual({ hasDocument: true, canUndo: false, canRedo: false, isBlocked: true });
    expect(() => editor.undo()).toThrow("undo not allowed after io command");
    expect(() => editor.redo()).toThrow("undo not allowed after io command");
    expect(editor.init(100.5, 200.25)).toEqual({ width: 100.5, height: 200.25 });
  });

  it.each(requests)("creates $type both at root and inside a container", request => {
    const editor = new Editor();
    editor.init();
    editor.create({ type: "g", id: "parent" });
    expect(editor.create(request).operation).toBe("create");
    expect(editor.show(request.id).parentId).toBeNull();
    editor.create({ ...request, id: "nested", parentId: "parent" });
    expect(editor.show("nested").parentId).toBe("parent");
    expect(ids(editor, "parent")).toEqual(["nested"]);
    const beforeUndo = editor.tree();
    expect(editor.undo().direction).toBe("undo");
    expect(() => editor.show("nested")).toThrow("no such shape: nested");
    expect(editor.redo().restored).toEqual(beforeUndo);
  });

  it("does not retain mutable request or result references", () => {
    const editor = new Editor();
    editor.init();
    const request: CreateRequest = { type: "rect", id: "r", x: 1, y: 2, width: 3, height: 4, fill: "red" };
    const mutable = { ...request };
    editor.create(mutable);
    mutable.x = 999;
    mutable.fill = "green";
    expect(editor.show("r").attributes.x).toBe(1);
    expect(editor.show("r").attributes.fill).toBe("red");
    const result = editor.move("r", 1, 2);
    expect(Object.isFrozen(result)).toBe(true);
    editor.undo();
    expect(editor.show("r").attributes.x).toBe(1);
  });

  it("delegates geometry, attributes and deletion through undoable commands", () => {
    const editor = fixture();
    expect(editor.move("left", 2, 3).operation).toBe("move");
    expect(editor.scale("left", 2).operation).toBe("scale");
    expect(editor.show("r").attributes).toEqual({ fill: "red", x: 6, y: 10, width: 6, height: 8 });
    expect(editor.setAttribute("t", "text", "updated").operation).toBe("set");
    expect(editor.show("t").attributes.text).toBe("updated");
    const beforeDelete = editor.tree();
    expect(editor.delete("left").operation).toBe("delete");
    expect(() => editor.show("r")).toThrow();
    expect(editor.undo().restored).toEqual(beforeDelete);
    editor.redo();
    expect(() => editor.show("left")).toThrow();
  });

  it("delegates group, ungroup, migration and Z-order, preserving model semantics", () => {
    const editor = fixture();
    const beforeGroup = editor.tree();
    expect(editor.group("joined", ["t", "r"]).operation).toBe("group");
    expect(ids(editor, "joined")).toEqual(["r", "t"]);
    expect(ids(editor, "scene")).toEqual(["joined", "left", "right"]);
    expect(editor.undo().restored).toEqual(beforeGroup);
    editor.redo();
    expect(editor.ungroup("joined").operation).toBe("ungroup");
    expect(ids(editor, "scene")).toEqual(["r", "t", "left", "right"]);
    expect(editor.addTo("right", "r").operation).toBe("addto");
    expect(editor.show("r").parentId).toBe("right");
    expect(editor.front("t").operation).toBe("front");
    expect(ids(editor, "scene")).toEqual(["left", "right", "t"]);
    expect(editor.back("t").operation).toBe("back");
    expect(ids(editor, "scene")).toEqual(["t", "left", "right"]);
  });

  it("resize preserves shapes and starts a fresh history at the new canvas size", () => {
    const editor = fixture();
    const roots = editor.tree().roots;
    editor.move("r", 10, 0);
    editor.undo(); // ensure both stacks have entries
    expect(editor.resizeCanvas(200, 100)).toEqual({ width: 200, height: 100 });
    expect(editor.tree().roots).toEqual(roots);
    expect(editor.getStatus()).toEqual({ hasDocument: true, canUndo: false, canRedo: false, isBlocked: true });
    editor.move("r", 1, 0);
    editor.undo();
    expect(editor.getCanvas()).toEqual({ width: 200, height: 100 });
    expect(editor.show("r").attributes.x).toBe(1);
    expect(() => editor.undo()).toThrow("nothing to undo");
  });

  it("same-size resize still sets a barrier; queries never do", () => {
    const editor = fixture();
    editor.move("r", 1, 0);
    editor.undo();
    const before = state(editor);
    editor.getCanvas();
    editor.getStatus();
    editor.tree();
    editor.tree("left");
    editor.show("r");
    expect(state(editor)).toEqual(before);
    editor.resizeCanvas(400, 300);
    expect(editor.getStatus().isBlocked).toBe(true);
    expect(editor.getStatus().canRedo).toBe(false);
  });

  it("init replaces the document and prevents crossing into the old history", () => {
    const editor = fixture();
    editor.init(10, 20);
    expect(editor.tree()).toEqual({ width: 10, height: 20, roots: [] });
    editor.create({ type: "g", id: "new" });
    editor.undo();
    expect(editor.tree().roots).toEqual([]);
    expect(() => editor.undo()).toThrow("nothing to undo");
  });

  it.each([0, -1, NaN, Infinity])("failed init/resize with %s preserve all state", value => {
    const editor = fixture();
    editor.undo();
    unchanged(editor, () => editor.init(value, 20));
    unchanged(editor, () => editor.init(20, value));
    unchanged(editor, () => editor.resizeCanvas(value, 20));
    unchanged(editor, () => editor.resizeCanvas(20, value));
    expect(editor.getStatus().canRedo).toBe(true);
  });

  it("failed factory creation or model operations preserve Redo", () => {
    const editor = fixture();
    editor.move("r", 10, 0);
    editor.undo();
    for (const action of [
      () => editor.create({ type: "circle", id: "bad", cx: 0, cy: 0, r: -1 }),
      () => editor.create({ type: "g", id: "r" }),
      () => editor.create({ type: "g", id: "new", parentId: "r" }),
      () => editor.create({ type: "g", id: "new", parentId: "missing" }),
      () => editor.create({ type: "box", id: "box" } as unknown as CreateRequest),
      () => editor.move("r", Infinity, 0), () => editor.scale("r", 0),
      () => editor.setAttribute("r", "width", ""), () => editor.delete("missing"),
      () => editor.group("invalid", ["left", "r"]), () => editor.ungroup("scene"),
      () => editor.addTo("left", "scene"), () => editor.front("missing"), () => editor.back("missing"),
      () => editor.tree("missing"), () => editor.show("missing"),
    ]) unchanged(editor, action);
    editor.redo();
    expect(editor.show("r").attributes.x).toBe(11);
  });

  it("a failed edit does not release the initialization barrier", () => {
    const editor = new Editor();
    editor.init();
    unchanged(editor, () => editor.create({ type: "circle", id: "c", cx: 0, cy: 0, r: -1 }));
    unchanged(editor, () => editor.move("missing", 0, 0));
    expect(() => editor.undo()).toThrow("undo not allowed after io command");
    expect(() => editor.redo()).toThrow("undo not allowed after io command");
  });

  it("returns independent deeply frozen tree/show data with true parent IDs", () => {
    const editor = fixture();
    const full: DocumentView = editor.tree();
    const subtree: ShapeView = editor.tree("left");
    const details = editor.show("r");
    expect(subtree.parentId).toBe("scene");
    expect(details).toEqual({
      id: "r", type: "Rectangle", parentId: "left",
      attributes: { fill: "red", x: 1, y: 2, width: 3, height: 4 },
    });
    expect("children" in details).toBe(false);
    expect(editor.tree("r").children).toEqual([]);
    expect(Object.isFrozen(full)).toBe(true);
    expect(Object.isFrozen(full.roots)).toBe(true);
    expect(Object.isFrozen(subtree.children)).toBe(true);
    expect(Object.isFrozen(details)).toBe(true);
    expect(Object.isFrozen(details.attributes)).toBe(true);
    expect(() => (full.roots as ShapeView[]).pop()).toThrow();
    expect(() => { (details.attributes as Record<string, number>).x = 99; }).toThrow();
    editor.move("r", 100, 0);
    expect(details.attributes.x).toBe(1);
    expect(subtree.children[0]!.attributes.x).toBe(1);
    expect(editor.show("r").attributes.x).toBe(101);
    expect(editor.tree()).not.toBe(full);
    expect(editor.show("r")).not.toBe(details);
  });

  it("supports two independent editors without shared document or history", () => {
    const a = fixture();
    const b = fixture();
    const before = state(b);
    a.move("r", 10, 0);
    a.resizeCanvas(10, 20);
    expect(state(b)).toEqual(before);
  });
});
