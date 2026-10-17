import { afterEach, describe, expect, it, vi } from "vitest";
import { SvgDocument } from "../../src/model/SvgDocument";
import { Shape } from "../../src/model/Shape";
import { Group } from "../../src/model/Group";
import { Rectangle } from "../../src/model/Rectangle";
import { Circle } from "../../src/model/Circle";
import { Ellipse } from "../../src/model/Ellipse";
import { Line } from "../../src/model/Line";
import { TextShape } from "../../src/model/TextShape";

const circle = (id: string) => new Circle(id, 1, 2, 3);
function group(id: string, ...children: Shape[]): Group {
  const result = new Group(id, { fill: "blue", stroke: "black", "stroke-width": 2 });
  children.forEach(child => result.addChild(child));
  return result;
}
function fixture(): SvgDocument {
  const doc = new SvgDocument(400, 300);
  doc.addShape(circle("before"));
  doc.addShape(group("scene",
    circle("a"),
    group("left", new Rectangle("r", 1, 2, 3, 4, { fill: "red" }), circle("b")),
    circle("middle"),
    group("right", new TextShape("t", 5, 6, "hello"), circle("c")),
    circle("z"),
  ));
  doc.addShape(circle("after"));
  return doc;
}
function ids(doc: SvgDocument, parent?: string): string[] {
  return (parent === undefined ? doc.getRootSnapshots() :
    (doc.getShapeSnapshot(parent) as Group).children).map(shape => shape.id);
}
function state(doc: SvgDocument) {
  return { width: doc.width, height: doc.height, roots: doc.getRootSnapshots() };
}
function expectUnchanged(doc: SvgDocument, action: () => void, error?: string): void {
  const before = state(doc);
  if (error === undefined) expect(action).toThrow();
  else expect(action).toThrow(error);
  expect(state(doc)).toEqual(before);
}

// Detect invalid ownership independently through the public snapshot tree.
function expectTree(doc: SvgDocument): void {
  const objects = new Set<Shape>();
  const names = new Set<string>();
  const visit = (node: Shape, parent: string | null): void => {
    expect(objects.has(node)).toBe(false);
    expect(names.has(node.id)).toBe(false);
    objects.add(node);
    names.add(node.id);
    expect(doc.getParentId(node.id)).toBe(parent);
    if (node instanceof Group) node.children.forEach(child => visit(child, node.id));
  };
  doc.getRootSnapshots().forEach(node => visit(node, null));
}

afterEach(() => vi.restoreAllMocks());

describe("SvgDocument", () => {
  it("provides default canvas dimensions and atomic resizing", () => {
    const doc = new SvgDocument();
    expect([doc.width, doc.height]).toEqual([800, 600]);
    doc.resize(100.5, 200.25);
    expect([doc.width, doc.height]).toEqual([100.5, 200.25]);
    expect(doc.getRootSnapshots()).toEqual([]);
  });

  it.each([0, -1, NaN, Infinity, -Infinity])("rejects invalid dimensions %s", value => {
    expect(() => new SvgDocument(value, 100)).toThrow();
    expect(() => new SvgDocument(100, value)).toThrow();
    const doc = fixture();
    expectUnchanged(doc, () => doc.resize(50, value));
    expectUnchanged(doc, () => doc.resize(value, 50));
  });

  it("adds isolated subtrees, locates descendants, and preserves root and child order", () => {
    const doc = fixture();
    doc.addShape(circle("inserted"), undefined, 1);
    doc.addShape(circle("inner"), "left", 1);
    expect(ids(doc)).toEqual(["before", "inserted", "scene", "after"]);
    expect(ids(doc, "left")).toEqual(["r", "inner", "b"]);
    expect(doc.hasShape("r")).toBe(true);
    expect(doc.hasShape("R")).toBe(false);
    expect(doc.hasShape("missing")).toBe(false);
    expect(doc.getParentId("scene")).toBeNull();
    expect(doc.getParentId("r")).toBe("left");
    expectTree(doc);
  });

  it("isolates input objects and every query result from the document", () => {
    const source = group("g", circle("c"));
    const doc = new SvgDocument();
    doc.addShape(source);
    source.addChild(circle("external"));
    source.move(10, 20);
    const snapshot = doc.getShapeSnapshot("g") as Group;
    snapshot.addChild(circle("snapshot-only"));
    snapshot.move(30, 40);
    const roots = doc.getRootSnapshots();
    (roots[0] as Group).removeChild((roots[0] as Group).children[0]!);
    expect(() => (roots as Shape[]).pop()).toThrow();
    expect(ids(doc, "g")).toEqual(["c"]);
    expect(doc.getShapeSnapshot("c")).toEqual(circle("c"));
    expect(doc.getShapeSnapshot("g")).not.toBe(doc.getShapeSnapshot("g"));
  });

  it("allows the same source to be copied into independent documents", () => {
    const source = group("g", circle("c"));
    const a = new SvgDocument();
    const b = new SvgDocument();
    a.addShape(source);
    b.addShape(source);
    a.move("c", 1, 2);
    expect(b.getShapeSnapshot("c")).toEqual(circle("c"));
    expect(source.children[0]).toEqual(circle("c"));
  });

  it("enforces case-sensitive document-wide IDs across roots and nested nodes", () => {
    const doc = fixture();
    expectUnchanged(doc, () => doc.addShape(circle("r")), "id already exists: r");
    expectUnchanged(doc, () => doc.addShape(group("new", circle("a")), "right"));
    expectUnchanged(doc, () => doc.addShape(group("new", circle("duplicate"), circle("duplicate"))));
    expectUnchanged(doc, () => doc.addShape(group("same", circle("same"))));
    doc.addShape(circle("R"));
    expect(doc.hasShape("R")).toBe(true);
    expectTree(doc);
  });

  it.each([false, true])("rejects shared input objects before cloning (shared group: %s)", composite => {
    const shared = composite ? group("shared", circle("leaf")) : circle("shared");
    const source = group("source", group("p", shared), group("q", shared));
    const clone = vi.spyOn(source, "clone");
    const doc = fixture();
    expectUnchanged(doc, () => doc.addShape(source), "multiple parents");
    expect(clone).not.toHaveBeenCalled();
  });

  it("rejects malformed cyclic input before cloning", () => {
    const source = new Group("cycle");
    // Public Group methods prevent cycles; inject a malformed boundary input.
    vi.spyOn(source, "children", "get").mockReturnValue([source]);
    const clone = vi.spyOn(source, "clone");
    const doc = fixture();
    expectUnchanged(doc, () => doc.addShape(source), "circular containment");
    expect(clone).not.toHaveBeenCalled();
  });

  it.each([-1, 0.5, 100, NaN, Infinity])("rejects invalid insertion index %s", index => {
    const doc = fixture();
    expectUnchanged(doc, () => doc.addShape(circle("new"), undefined, index));
    expectUnchanged(doc, () => doc.addShape(circle("new"), "left", index));
  });

  it("rejects missing or non-container parents", () => {
    const doc = fixture();
    expectUnchanged(doc, () => doc.addShape(circle("new"), "missing"), "no such container: missing");
    expectUnchanged(doc, () => doc.addShape(circle("new"), "r"), "not a container: r");
  });

  it("deletes complete subtrees and releases their IDs for later reuse", () => {
    const doc = fixture();
    doc.deleteShape("left");
    expect(ids(doc, "scene")).toEqual(["a", "middle", "right", "z"]);
    for (const id of ["left", "r", "b"]) expect(doc.hasShape(id)).toBe(false);
    doc.addShape(circle("r"));
    doc.deleteShape("scene");
    expect(ids(doc)).toEqual(["before", "after", "r"]);
    expect(doc.hasShape("t")).toBe(false);
    expectTree(doc);
  });

  it("delegates transformations and attributes by ID without overriding child styles", () => {
    const doc = fixture();
    doc.move("left", 2, 3);
    doc.scale("left", 2);
    const rect = doc.getShapeSnapshot("r") as Rectangle;
    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([6, 10, 6, 8]);
    doc.setAttribute("left", "fill", "yellow");
    doc.setAttribute("t", "text", "updated");
    expect(doc.getShapeSnapshot("left").fill).toBe("yellow");
    expect(doc.getShapeSnapshot("r").fill).toBe("red");
    expect((doc.getShapeSnapshot("t") as TextShape).text).toBe("updated");
  });

  it("keeps failed geometry and attribute edits atomic", () => {
    const doc = fixture();
    doc.setAttribute("b", "cy", Number.MAX_VALUE);
    expectUnchanged(doc, () => doc.move("left", 1, Number.MAX_VALUE));
    expectUnchanged(doc, () => doc.scale("left", 2));
    expectUnchanged(doc, () => doc.scale("r", 0));
    expectUnchanged(doc, () => doc.move("r", NaN, 1));
    expectUnchanged(doc, () => doc.setAttribute("r", "width", ""));
    expectUnchanged(doc, () => doc.setAttribute("r", "id", "changed"));
  });

  it("groups siblings in original DFS order at the earliest selected position", () => {
    const doc = fixture();
    doc.group("selected", ["z", "middle", "a"]);
    expect(ids(doc, "scene")).toEqual(["selected", "left", "right"]);
    expect(ids(doc, "selected")).toEqual(["a", "middle", "z"]);
    expect(doc.getParentId("selected")).toBe("scene");
    expectTree(doc);
  });

  it("groups across containers at their nearest common parent", () => {
    const doc = fixture();
    doc.group("selected", ["t", "b"]);
    expect(ids(doc, "scene")).toEqual(["a", "selected", "left", "middle", "right", "z"]);
    expect(ids(doc, "selected")).toEqual(["b", "t"]);
    expect(ids(doc, "left")).toEqual(["r"]);
    expect(ids(doc, "right")).toEqual(["c"]);
    expect(ids(doc)).toEqual(["before", "scene", "after"]);
    expectTree(doc);
  });

  it("can group across root branches and accepts one selected member", () => {
    const doc = fixture();
    doc.group("across", ["after", "r"]);
    expect(ids(doc)).toEqual(["before", "across", "scene"]);
    expect(ids(doc, "across")).toEqual(["r", "after"]);
    doc.group("single", ["b"]);
    expect(ids(doc, "left")).toEqual(["single"]);
    expect(ids(doc, "single")).toEqual(["b"]);
    expectTree(doc);
  });

  it.each([
    ["new", []], ["new", ["a", "a"]], ["new", ["a", "missing"]],
    ["a", ["b"]], ["new", ["left", "r"]], ["new", ["r", "scene"]], ["", ["a"]],
  ] as [string, string[]][])("rejects invalid group %s %j atomically", (name, members) => {
    const doc = fixture();
    expectUnchanged(doc, () => doc.group(name, members));
  });

  it("ungroups nested containers in place with their original child order", () => {
    const doc = fixture();
    doc.ungroup("left");
    expect(ids(doc, "scene")).toEqual(["a", "r", "b", "middle", "right", "z"]);
    expect(doc.hasShape("left")).toBe(false);
    expect(doc.getParentId("r")).toBe("scene");
    expect(doc.getShapeSnapshot("r").fill).toBe("red");
    expectTree(doc);
  });

  it("ungroups an empty nested container", () => {
    const doc = fixture();
    doc.addShape(new Group("empty"), "scene", 1);
    doc.ungroup("empty");
    expect(ids(doc, "scene")).toEqual(["a", "left", "middle", "right", "z"]);
  });

  it("rejects top-level ungroup and non-group targets", () => {
    const doc = fixture();
    expectUnchanged(doc, () => doc.ungroup("scene"), "cannot ungroup top-level container: scene");
    expectUnchanged(doc, () => doc.ungroup("r"), "not a container: r");
  });

  it("moves existing subtrees between containers, including root and same-parent cases", () => {
    const doc = fixture();
    doc.addTo("right", "left");
    expect(ids(doc, "scene")).toEqual(["a", "middle", "right", "z"]);
    expect(ids(doc, "right")).toEqual(["t", "c", "left"]);
    expect(doc.getParentId("r")).toBe("left");
    doc.addTo("left", "before");
    expect(ids(doc)).toEqual(["scene", "after"]);
    expect(ids(doc, "left")).toEqual(["r", "b", "before"]);
    doc.addTo("left", "r");
    expect(ids(doc, "left")).toEqual(["b", "before", "r"]);
    doc.addTo("scene", "left");
    expect(ids(doc, "right")).toEqual(["t", "c"]);
    expect(ids(doc, "scene")).toEqual(["a", "middle", "right", "z", "left"]);
    expectTree(doc);
  });

  it.each([["scene", "scene"], ["left", "scene"], ["r", "a"], ["missing", "a"], ["left", "missing"]])(
    "rejects invalid migration to %s of %s atomically", (target, id) => {
      const doc = fixture();
      expectUnchanged(doc, () => doc.addTo(target, id));
    },
  );

  it("changes only sibling Z-order, with front at the end and back at the start", () => {
    const doc = fixture();
    doc.bringToFront("before");
    expect(ids(doc)).toEqual(["scene", "after", "before"]);
    doc.sendToBack("before");
    expect(ids(doc)).toEqual(["before", "scene", "after"]);
    doc.bringToFront("a");
    expect(ids(doc, "scene")).toEqual(["left", "middle", "right", "z", "a"]);
    doc.sendToBack("a");
    expect(ids(doc, "scene")).toEqual(["a", "left", "middle", "right", "z"]);
    const before = state(doc);
    doc.sendToBack("a");
    doc.bringToFront("z");
    expect(state(doc)).toEqual(before);
    expectTree(doc);
  });

  it("reports missing IDs without modifying the document", () => {
    const doc = fixture();
    const actions = [
      () => doc.getShapeSnapshot("missing"), () => doc.getParentId("missing"),
      () => doc.deleteShape("missing"), () => doc.move("missing", 1, 2),
      () => doc.scale("missing", 2), () => doc.setAttribute("missing", "fill", "red"),
      () => doc.ungroup("missing"), () => doc.bringToFront("missing"), () => doc.sendToBack("missing"),
    ];
    actions.forEach(action => expectUnchanged(doc, action, "no such shape: missing"));
  });

  it("clones dimensions, every built-in type, attributes and order independently", () => {
    const doc = fixture();
    doc.addShape(new Ellipse("e", 1, 2, 3, 4, { stroke: "red" }), "left");
    doc.addShape(new Line("l", 1, 2, 3, 4, { "stroke-width": 5 }), "right");
    const clone = doc.clone();
    expect(clone).not.toBe(doc);
    expect(state(clone)).toEqual(state(doc));
    const types = [
      ["scene", Group], ["r", Rectangle], ["a", Circle], ["e", Ellipse], ["l", Line], ["t", TextShape],
    ] as const;
    for (const [id, type] of types) expect(clone.getShapeSnapshot(id)).toBeInstanceOf(type);
    const before = state(doc);
    clone.move("scene", 10, 20);
    clone.setAttribute("t", "text", "clone text");
    clone.setAttribute("r", "fill", "purple");
    clone.resize(100, 200);
    clone.addTo("right", "r");
    clone.deleteShape("a");
    expect(state(doc)).toEqual(before);
    const clonedState = state(clone);
    doc.deleteShape("right");
    expect(state(clone)).toEqual(clonedState);
    expectTree(clone);
  });

  it("clones an empty document", () => {
    const doc = new SvgDocument(10, 20);
    const copy = doc.clone();
    copy.addShape(circle("c"));
    expect(state(doc)).toEqual({ width: 10, height: 20, roots: [] });
  });

  it.each(["group", "ungroup", "addTo", "front"] as const)(
    "discards partial work if a Group insertion throws during %s", operation => {
      const doc = fixture();
      const before = state(doc);
      const original = Group.prototype.addChild;
      const spy = vi.spyOn(Group.prototype, "addChild").mockImplementation(function (this: Group, child, index) {
        // These pairs do not occur during document cloning; failure happens
        // after the working tree has already detached at least one node.
        if ((operation === "group" && this.id === "new") ||
            (operation === "ungroup" && this.id === "scene" && child.id === "r") ||
            (operation === "addTo" && this.id === "right" && child.id === "r") ||
            (operation === "front" && this.id === "left" && child.id === "r" && index === 1)) {
          throw new Error("injected insertion failure");
        }
        return original.call(this, child, index);
      });
      expect(() => {
        if (operation === "group") doc.group("new", ["a", "z"]);
        else if (operation === "ungroup") doc.ungroup("left");
        else if (operation === "addTo") doc.addTo("right", "r");
        else doc.bringToFront("r");
      }).toThrow("injected insertion failure");
      spy.mockRestore();
      expect(state(doc)).toEqual(before);
      expectTree(doc);
    },
  );
});
