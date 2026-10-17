import { describe, expect, it } from "vitest";
import { TextShape } from "../../src/model/TextShape";

describe("TextShape", () => {
  const make = () => new TextShape("s1", 1, 2, "hello world", { fill: "red", stroke: "blue", "stroke-width": 2 });
  const geometry = (s: TextShape) => [s.x, s.y];

  it("moves positions and scales all geometry, preserving style", () => {
    const moved = make();
    moved.move(10, -10);
    expect(geometry(moved)).toEqual([11, -8]);
    const scaled = make();
    scaled.scale(2);
    expect(geometry(scaled)).toEqual([2, 4]);
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
    other.setAttribute("y", Number.MAX_VALUE);
    const beforeScale = geometry(other);
    expect(() => other.scale(2)).toThrow();
    expect(geometry(other)).toEqual(beforeScale);
  });

  it("clones the concrete type and every property without sharing mutable state", () => {
    const s = make();
    const copy: TextShape = s.clone();
    expect(copy).toBeInstanceOf(TextShape);
    expect(copy).not.toBe(s);
    expect(copy.id).toBe(s.id);
    expect(geometry(copy)).toEqual(geometry(s));
    expect([copy.fill, copy.stroke, copy.strokeWidth]).toEqual([s.fill, s.stroke, s.strokeWidth]);
    copy.move(10, 20);
    copy.setAttribute("fill", "green");
    copy.setAttribute("stroke", "none");
    copy.setAttribute("stroke-width", 9);
    expect(geometry(s)).toEqual([1, 2]);
    expect([s.fill, s.stroke, s.strokeWidth]).toEqual(["red", "blue", 2]);
    s.setAttribute("fill", "yellow");
    expect(copy.fill).toBe("green");
    expect(copy.text).toBe("hello world");
    copy.setAttribute("text", "changed");
    expect(s.text).toBe("hello world");
    expect(copy.text).toBe("changed");
  });

  it("preserves absent style attributes through cloning", () => {
    const s = new TextShape("plain", 1, 2, "hello world");
    const copy = s.clone();
    expect([copy.fill, copy.stroke, copy.strokeWidth]).toEqual([undefined, undefined, undefined]);
  });

  it("rejects unknown attributes and ID changes", () => {
    const s = make();
    for (const attr of ["id", "opacity", "font-size", "unknown"]) {
      expect(() => s.setAttribute(attr, "value")).toThrow(`unknown attribute: ${attr}`);
    }
    expect(s.id).toBe("s1");
    expect(() => s.setAttribute("fill", 123)).toThrow();
    expect(() => s.setAttribute("stroke", 123)).toThrow();
    expect(() => s.setAttribute("stroke-width", -1)).toThrow();
    expect([s.fill, s.stroke, s.strokeWidth]).toEqual(["red", "blue", 2]);
  });

  it("allows empty text and preserves content through transforms", () => {
    const s = make();
    s.move(1, 2);
    s.scale(3);
    expect(s.text).toBe("hello world");
    s.setAttribute("text", "");
    expect(s.text).toBe("");
    expect(() => s.setAttribute("text", 12)).toThrow();
    expect(s.text).toBe("");
  });

  it("validates constructor geometry, ID, and style", () => {
    expect(() => new TextShape("s", NaN, 2, "text")).toThrow();
    expect(() => new TextShape("s", Infinity, 2, "text")).toThrow();
    expect(() => new TextShape("s", 1, NaN, "text")).toThrow();
    expect(() => new TextShape("s", 1, Infinity, "text")).toThrow();
    expect(() => new TextShape("", 1, 2, "hello world")).toThrow();
    expect(() => new TextShape("s", 1, 2, "hello world", { "stroke-width": -1 })).toThrow();
  });
});
