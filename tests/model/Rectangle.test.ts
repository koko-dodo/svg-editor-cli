import { describe, expect, it } from "vitest";
import { Rectangle } from "../../src/model/Rectangle";

describe("Rectangle", () => {
  const make = () => new Rectangle("s1", 1, 2, 3, 4, { fill: "red", stroke: "blue", "stroke-width": 2 });
  const geometry = (s: Rectangle) => [s.x, s.y, s.width, s.height];

  it("moves positions and scales all geometry, preserving style", () => {
    const moved = make();
    moved.move(10, -10);
    expect(geometry(moved)).toEqual([11, -8, 3, 4]);
    const scaled = make();
    scaled.scale(2);
    expect(geometry(scaled)).toEqual([2, 4, 6, 8]);
    expect([scaled.fill, scaled.stroke, scaled.strokeWidth]).toEqual(["red", "blue", 2]);
  });

  it("supports fractional and negative coordinates and identity transforms", () => {
    const s = make();
    s.setAttribute("x", " -1.25e1 ");
    expect(s.x).toBe(-12.5);
    const before = geometry(s);
    s.move(0, 0);
    s.scale(1);
    expect(geometry(s)).toEqual(before);
    s.scale(0.5);
    expect(s.x).toBe(-6.25);
  });

  it("sets every allowed geometry attribute and shared style", () => {
    const s = make();
    s.setAttribute("x", "4.5");
    expect(s.x).toBe(4.5);
    s.setAttribute("y", "4.5");
    expect(s.y).toBe(4.5);
    s.setAttribute("width", "4.5");
    expect(s.width).toBe(4.5);
    s.setAttribute("height", "4.5");
    expect(s.height).toBe(4.5);
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "#abc");
    s.setAttribute("stroke-width", "0");
    expect([s.fill, s.stroke, s.strokeWidth]).toEqual(["none", "#abc", 0]);
  });

  it.each(["", " ", "12px", "1.2.3", "0x10", "NaN", "Infinity", "1e309", NaN, Infinity, -Infinity])(
    "rejects invalid numeric input %s without changing state", (value) => {
      const s = make();
      const before = geometry(s);
      expect(() => s.setAttribute("x", value)).toThrow();
      expect(() => s.setAttribute("y", value)).toThrow();
      expect(() => s.setAttribute("width", value)).toThrow();
      expect(() => s.setAttribute("height", value)).toThrow();
      expect(() => s.setAttribute("stroke-width", value)).toThrow();
      expect(geometry(s)).toEqual(before);
      expect(s.strokeWidth).toBe(2);
    },
  );

  it.each([0, -1, NaN, Infinity, -Infinity])("rejects invalid scale %s", (factor) => {
    const s = make();
    const before = geometry(s);
    expect(() => s.scale(factor)).toThrow("scale factor must be positive");
    expect(geometry(s)).toEqual(before);
  });

  it("rejects invalid movement without partial changes", () => {
    const s = make();
    const before = geometry(s);
    expect(() => s.move(1, NaN)).toThrow();
    expect(() => s.move(Infinity, 1)).toThrow();
    expect(geometry(s)).toEqual(before);
  });

  it("validates all calculated results before committing movement or scaling", () => {
    const s = make();
    s.setAttribute("y", Number.MAX_VALUE);
    const beforeMove = geometry(s);
    expect(() => s.move(1, Number.MAX_VALUE)).toThrow();
    expect(geometry(s)).toEqual(beforeMove);
    const other = make();
    other.setAttribute("height", Number.MAX_VALUE);
    const beforeScale = geometry(other);
    expect(() => other.scale(2)).toThrow();
    expect(geometry(other)).toEqual(beforeScale);
  });

  it("clones the concrete type and every property without sharing mutable state", () => {
    const s = make();
    const copy: Rectangle = s.clone();
    expect(copy).toBeInstanceOf(Rectangle);
    expect(copy).not.toBe(s);
    expect(copy.id).toBe(s.id);
    expect(geometry(copy)).toEqual(geometry(s));
    expect([copy.fill, copy.stroke, copy.strokeWidth]).toEqual([s.fill, s.stroke, s.strokeWidth]);
    copy.move(10, 20);
    copy.setAttribute("fill", "green");
    copy.setAttribute("stroke", "none");
    copy.setAttribute("stroke-width", 9);
    expect(geometry(s)).toEqual([1, 2, 3, 4]);
    expect([s.fill, s.stroke, s.strokeWidth]).toEqual(["red", "blue", 2]);
    s.setAttribute("fill", "yellow");
    expect(copy.fill).toBe("green");
  });

  it("preserves absent style attributes through cloning", () => {
    const s = new Rectangle("plain", 1, 2, 3, 4);
    const copy = s.clone();
    expect([copy.fill, copy.stroke, copy.strokeWidth]).toEqual([undefined, undefined, undefined]);
  });

  it("rejects unknown attributes and ID changes", () => {
    const s = make();
    for (const attr of ["id", "opacity", "font-size", "unknown", "text"]) {
      expect(() => s.setAttribute(attr, "value")).toThrow(`unknown attribute: ${attr}`);
    }
    expect(s.id).toBe("s1");
    expect(() => s.setAttribute("fill", 123)).toThrow();
    expect(() => s.setAttribute("stroke", 123)).toThrow();
    expect(() => s.setAttribute("stroke-width", -1)).toThrow();
    expect([s.fill, s.stroke, s.strokeWidth]).toEqual(["red", "blue", 2]);
  });

  it("allows zero sizes but rejects negative sizes atomically", () => {
    const s = make();
    s.setAttribute("width", 0);
    expect(() => s.setAttribute("width", -1)).toThrow();
    expect(s.width).toBe(0);
    s.setAttribute("height", 0);
    expect(() => s.setAttribute("height", -1)).toThrow();
    expect(s.height).toBe(0);
  });

  it("validates constructor geometry, ID, and style", () => {
    expect(() => new Rectangle("s", NaN, 2, 3, 4)).toThrow();
    expect(() => new Rectangle("s", Infinity, 2, 3, 4)).toThrow();
    expect(() => new Rectangle("s", 1, NaN, 3, 4)).toThrow();
    expect(() => new Rectangle("s", 1, Infinity, 3, 4)).toThrow();
    expect(() => new Rectangle("s", 1, 2, NaN, 4)).toThrow();
    expect(() => new Rectangle("s", 1, 2, Infinity, 4)).toThrow();
    expect(() => new Rectangle("s", 1, 2, -1, 4)).toThrow();
    expect(() => new Rectangle("s", 1, 2, 3, NaN)).toThrow();
    expect(() => new Rectangle("s", 1, 2, 3, Infinity)).toThrow();
    expect(() => new Rectangle("s", 1, 2, 3, -1)).toThrow();
    expect(() => new Rectangle("", 1, 2, 3, 4)).toThrow();
    expect(() => new Rectangle("s", 1, 2, 3, 4, { "stroke-width": -1 })).toThrow();
  });
});
