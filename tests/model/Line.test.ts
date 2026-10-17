import { describe, expect, it } from "vitest";
import { Line } from "../../src/model/Line";

describe("Line", () => {
  const make = () => new Line("s1", 1, 2, 3, 4, { fill: "red", stroke: "blue", "stroke-width": 2 });
  const geometry = (s: Line) => [s.x1, s.y1, s.x2, s.y2];

  it("moves positions and scales all geometry, preserving style", () => {
    const moved = make();
    moved.move(10, -10);
    expect(geometry(moved)).toEqual([11, -8, 13, -6]);
    const scaled = make();
    scaled.scale(2);
    expect(geometry(scaled)).toEqual([2, 4, 6, 8]);
    expect([scaled.fill, scaled.stroke, scaled.strokeWidth]).toEqual(["red", "blue", 2]);
  });

  it("supports fractional and negative coordinates and identity transforms", () => {
    const s = make();
    s.setAttribute("x1", " -1.25e1 ");
    expect(s.x1).toBe(-12.5);
    const before = geometry(s);
    s.move(0, 0);
    s.scale(1);
    expect(geometry(s)).toEqual(before);
    s.scale(0.5);
    expect(s.x1).toBe(-6.25);
  });

  it("sets every allowed geometry attribute and shared style", () => {
    const s = make();
    s.setAttribute("x1", "4.5");
    expect(s.x1).toBe(4.5);
    s.setAttribute("y1", "4.5");
    expect(s.y1).toBe(4.5);
    s.setAttribute("x2", "4.5");
    expect(s.x2).toBe(4.5);
    s.setAttribute("y2", "4.5");
    expect(s.y2).toBe(4.5);
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "#abc");
    s.setAttribute("stroke-width", "0");
    expect([s.fill, s.stroke, s.strokeWidth]).toEqual(["none", "#abc", 0]);
  });

  it.each(["", " ", "12px", "1.2.3", "0x10", "NaN", "Infinity", "1e309", NaN, Infinity, -Infinity])(
    "rejects invalid numeric input %s without changing state", (value) => {
      const s = make();
      const before = geometry(s);
      expect(() => s.setAttribute("x1", value)).toThrow();
      expect(() => s.setAttribute("y1", value)).toThrow();
      expect(() => s.setAttribute("x2", value)).toThrow();
      expect(() => s.setAttribute("y2", value)).toThrow();
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
    s.setAttribute("y2", Number.MAX_VALUE);
    const beforeMove = geometry(s);
    expect(() => s.move(1, Number.MAX_VALUE)).toThrow();
    expect(geometry(s)).toEqual(beforeMove);
    const other = make();
    other.setAttribute("y2", Number.MAX_VALUE);
    const beforeScale = geometry(other);
    expect(() => other.scale(2)).toThrow();
    expect(geometry(other)).toEqual(beforeScale);
  });

  it("clones the concrete type and every property without sharing mutable state", () => {
    const s = make();
    const copy: Line = s.clone();
    expect(copy).toBeInstanceOf(Line);
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
    const s = new Line("plain", 1, 2, 3, 4);
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

  it("validates constructor geometry, ID, and style", () => {
    expect(() => new Line("s", NaN, 2, 3, 4)).toThrow();
    expect(() => new Line("s", Infinity, 2, 3, 4)).toThrow();
    expect(() => new Line("s", 1, NaN, 3, 4)).toThrow();
    expect(() => new Line("s", 1, Infinity, 3, 4)).toThrow();
    expect(() => new Line("s", 1, 2, NaN, 4)).toThrow();
    expect(() => new Line("s", 1, 2, Infinity, 4)).toThrow();
    expect(() => new Line("s", 1, 2, 3, NaN)).toThrow();
    expect(() => new Line("s", 1, 2, 3, Infinity)).toThrow();
    expect(() => new Line("", 1, 2, 3, 4)).toThrow();
    expect(() => new Line("s", 1, 2, 3, 4, { "stroke-width": -1 })).toThrow();
  });
});
