import { describe, expect, it } from "vitest";
import { Group } from "../../src/model/Group";
import { Shape } from "../../src/model/Shape";
import { Rectangle } from "../../src/model/Rectangle";
import { Circle } from "../../src/model/Circle";
import { Ellipse } from "../../src/model/Ellipse";
import { Line } from "../../src/model/Line";
import { TextShape } from "../../src/model/TextShape";

function fixture() {
  const root = new Group("root", { fill: "red", stroke: "black", "stroke-width": 2 });
  const nested = new Group("nested", { fill: "blue" });
  const deep = new Group("deep");
  const rect = new Rectangle("rect", 1, 2, 3, 4, { fill: "green" });
  const circle = new Circle("circle", 5, 6, 7);
  const ellipse = new Ellipse("ellipse", 8, 9, 10, 11);
  const line = new Line("line", 12, 13, 14, 15);
  const text = new TextShape("text", 16, 17, "hello world", { stroke: "gray" });
  root.addChild(rect);
  root.addChild(nested);
  nested.addChild(circle);
  nested.addChild(deep);
  deep.addChild(ellipse);
  deep.addChild(line);
  deep.addChild(text);
  return { root, nested, deep, rect, circle, ellipse, line, text };
}

function expectIndependent(original: Shape, copy: Shape): void {
  expect(copy).not.toBe(original);
  expect(copy.constructor).toBe(original.constructor);
  expect(copy).toEqual(original);
  if (original instanceof Group && copy instanceof Group) {
    expect(copy.children.map(child => child.id)).toEqual(original.children.map(child => child.id));
    original.children.forEach((child, index) => expectIndependent(child, copy.children[index]!));
  }
}

describe("Group", () => {
  it("is a Shape and supports ordered direct child insertion and removal", () => {
    const group = new Group("g");
    const a = new Circle("a", 0, 0, 1);
    const b = new Circle("b", 0, 0, 1);
    const c = new Circle("c", 0, 0, 1);
    expect(group).toBeInstanceOf(Shape);
    group.addChild(a);
    group.addChild(c);
    group.addChild(b, 1);
    expect(group.children).toEqual([a, b, c]);
    expect(group.indexOf(b)).toBe(1);
    expect(group.removeChild(b)).toBe(b);
    expect(group.children).toEqual([a, c]);
    expect(group.indexOf(b)).toBe(-1);
    group.addChild(b, 0);
    expect(group.children).toEqual([b, a, c]);
  });

  it("returns a frozen array copy without cloning its elements", () => {
    const { root, rect } = fixture();
    const snapshot = root.children;
    expect(snapshot).not.toBe(root.children);
    expect(snapshot[0]).toBe(rect);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(() => (snapshot as Shape[]).pop()).toThrow();
    root.removeChild(rect);
    expect(snapshot[0]).toBe(rect);
    expect(root.children).not.toContain(rect);
  });

  it.each([-1, 0.5, 2, NaN, Infinity])("rejects invalid insertion index %s atomically", index => {
    const root = new Group("root");
    expect(() => root.addChild(new Group("child"), index)).toThrow("invalid child index");
    expect(root.children).toEqual([]);
  });

  it("rejects direct duplicates and removing indirect or absent children", () => {
    const { root, nested, circle } = fixture();
    const before = root.children;
    expect(() => root.addChild(nested)).toThrow("child already exists in group");
    expect(() => root.removeChild(circle)).toThrow("not a direct child");
    expect(() => root.removeChild(new Group("absent"))).toThrow("not a direct child");
    expect(root.children).toEqual(before);
  });

  it("rejects self inclusion and indirect cycles without changing the structure", () => {
    const { root, nested, deep } = fixture();
    const before = root.clone();
    expect(() => root.addChild(root)).toThrow("circular containment");
    expect(() => nested.addChild(root)).toThrow("circular containment");
    expect(() => deep.addChild(root)).toThrow("circular containment");
    expect(root).toEqual(before);
  });

  it("does not enforce global ownership or ID uniqueness", () => {
    const a = new Group("same");
    const b = new Group("same");
    const shared = new Circle("same", 0, 0, 1);
    a.addChild(shared);
    b.addChild(shared);
    a.addChild(new Circle("same", 1, 1, 2));
    expect(a.children[0]).toBe(shared);
    expect(b.children[0]).toBe(shared);
    a.removeChild(shared);
    expect(b.children[0]).toBe(shared);
  });

  it("moves all five leaf types recursively and preserves references and styles", () => {
    const f = fixture();
    f.root.move(2, -3);
    expect([f.rect.x, f.rect.y, f.rect.width, f.rect.height]).toEqual([3, -1, 3, 4]);
    expect([f.circle.cx, f.circle.cy, f.circle.r]).toEqual([7, 3, 7]);
    expect([f.ellipse.cx, f.ellipse.cy, f.ellipse.rx, f.ellipse.ry]).toEqual([10, 6, 10, 11]);
    expect([f.line.x1, f.line.y1, f.line.x2, f.line.y2]).toEqual([14, 10, 16, 12]);
    expect([f.text.x, f.text.y, f.text.text]).toEqual([18, 14, "hello world"]);
    expect(f.root.children[0]).toBe(f.rect);
    expect(f.root.children[1]).toBe(f.nested);
    expect(f.nested.children[1]).toBe(f.deep);
    expect(f.deep.children[2]).toBe(f.text);
    expect([f.root.fill, f.nested.fill, f.rect.fill]).toEqual(["red", "blue", "green"]);
  });

  it("scales positions and dimensions recursively, preserving text and styles", () => {
    const f = fixture();
    f.root.scale(0.5);
    expect([f.rect.x, f.rect.y, f.rect.width, f.rect.height]).toEqual([0.5, 1, 1.5, 2]);
    expect([f.circle.cx, f.circle.cy, f.circle.r]).toEqual([2.5, 3, 3.5]);
    expect([f.ellipse.cx, f.ellipse.cy, f.ellipse.rx, f.ellipse.ry]).toEqual([4, 4.5, 5, 5.5]);
    expect([f.line.x1, f.line.y1, f.line.x2, f.line.y2]).toEqual([6, 6.5, 7, 7.5]);
    expect([f.text.x, f.text.y, f.text.text]).toEqual([8, 8.5, "hello world"]);
    expect(f.root.strokeWidth).toBe(2);
    expect(f.root.children[0]).toBe(f.rect);
    expect(f.deep.children[1]).toBe(f.line);
  });

  it.each(["move", "scale"] as const)("keeps every original unchanged when deep %s overflows", operation => {
    const f = fixture();
    f.text.setAttribute("y", Number.MAX_VALUE);
    const before = f.root.clone();
    expect(() => operation === "move" ? f.root.move(1, Number.MAX_VALUE) : f.root.scale(2)).toThrow();
    expect(f.root).toEqual(before);
    expect(f.root.children[0]).toBe(f.rect);
    expect(f.root.children[1]).toBe(f.nested);
    expect(f.nested.children[0]).toBe(f.circle);
    expect(f.nested.children[1]).toBe(f.deep);
    expect(f.deep.children[0]).toBe(f.ellipse);
    expect(f.deep.children[1]).toBe(f.line);
    expect(f.deep.children[2]).toBe(f.text);
  });

  it.each([0, -1, NaN, Infinity, -Infinity])("rejects invalid scale %s even for empty groups", value => {
    for (const group of [new Group("empty"), fixture().root]) {
      const before = group.clone();
      expect(() => group.scale(value)).toThrow("scale factor must be positive");
      expect(group).toEqual(before);
    }
  });

  it.each([NaN, Infinity, -Infinity])("rejects invalid movement %s even for empty groups", value => {
    for (const group of [new Group("empty"), fixture().root]) {
      const before = group.clone();
      expect(() => group.move(value, 0)).toThrow();
      expect(() => group.move(0, value)).toThrow();
      expect(group).toEqual(before);
    }
  });

  it("allows empty transformations and identity transformations", () => {
    const empty = new Group("empty");
    empty.move(1, 2);
    empty.scale(2);
    expect(empty.children).toEqual([]);
    const { root } = fixture();
    const before = root.clone();
    root.move(0, 0);
    root.scale(1);
    expect(root).toEqual(before);
  });

  it("sets only its own public styles and rejects other attributes", () => {
    const { root, nested, rect, circle } = fixture();
    root.setAttribute("fill", "yellow");
    root.setAttribute("stroke", "none");
    root.setAttribute("stroke-width", "3.5");
    expect([root.fill, root.stroke, root.strokeWidth]).toEqual(["yellow", "none", 3.5]);
    expect([nested.fill, rect.fill, circle.fill]).toEqual(["blue", "green", undefined]);
    for (const name of ["x", "width", "text", "id", "children"]) {
      expect(() => root.setAttribute(name, 1)).toThrow(`unknown attribute: ${name}`);
    }
    for (const value of ["", " ", "12px", "1e309", NaN, Infinity, -1]) {
      expect(() => root.setAttribute("stroke-width", value)).toThrow();
    }
    expect(root.strokeWidth).toBe(3.5);
  });

  it("deeply clones every type, ID, attribute and order independently", () => {
    const { root, rect, deep, text } = fixture();
    const copy: Group = root.clone();
    expectIndependent(root, copy);
    copy.move(10, 20);
    copy.setAttribute("fill", "purple");
    const copiedNested = copy.children[1] as Group;
    const copiedDeep = copiedNested.children[1] as Group;
    const copiedText = copiedDeep.children[2] as TextShape;
    copiedText.setAttribute("text", "changed");
    copiedDeep.removeChild(copiedText);
    expect([rect.x, rect.y, root.fill, text.text]).toEqual([1, 2, "red", "hello world"]);
    expect(deep.children[2]).toBe(text);
    root.removeChild(rect);
    expect(copy.children).toHaveLength(2);
  });

  it("clones empty groups with absent styles", () => {
    const original = new Group("empty");
    const copy = original.clone();
    expectIndependent(original, copy);
    expect([copy.fill, copy.stroke, copy.strokeWidth]).toEqual([undefined, undefined, undefined]);
  });

  it.each(["move", "scale"] as const)("preflights cumulative %s for shared leaves", operation => {
    const root = new Group("root");
    const a = new Group("a");
    const b = new Group("b");
    const leaf = new Circle("shared", Number.MAX_VALUE / 2, 0, 1);
    a.addChild(leaf);
    b.addChild(leaf);
    root.addChild(a);
    root.addChild(b);
    const before = leaf.clone();
    expect(() => operation === "move" ? root.move(Number.MAX_VALUE / 2, 0) : root.scale(2)).toThrow();
    expect(leaf).toEqual(before);
    expect(a.children[0]).toBe(leaf);
    expect(b.children[0]).toBe(leaf);
  });

  it("visits a shared leaf once per containment path", () => {
    const root = new Group("root");
    const nested = new Group("nested");
    const leaf = new Circle("shared", 1, 2, 3);
    root.addChild(leaf);
    nested.addChild(leaf);
    root.addChild(nested);
    root.move(1, 1);
    expect([leaf.cx, leaf.cy]).toEqual([3, 4]);
    root.scale(2);
    expect([leaf.cx, leaf.cy, leaf.r]).toEqual([12, 16, 12]);
  });
});
