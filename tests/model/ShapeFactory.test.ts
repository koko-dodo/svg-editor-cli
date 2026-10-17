import { describe, expect, it } from "vitest";
import { ShapeFactory } from "../../src/model/ShapeFactory";
import type { ShapeDefinition } from "../../src/model/ShapeFactory";
import { Rectangle } from "../../src/model/Rectangle";
import { Circle } from "../../src/model/Circle";
import { Ellipse } from "../../src/model/Ellipse";
import { Line } from "../../src/model/Line";
import { TextShape } from "../../src/model/TextShape";
import { Group } from "../../src/model/Group";

const definitions: ShapeDefinition[] = [
  { type: "rect", id: "r", x: 1, y: 2, width: 3, height: 4 },
  { type: "circle", id: "c", cx: 5, cy: 6, r: 7 },
  { type: "ellipse", id: "e", cx: 8, cy: 9, rx: 10, ry: 11 },
  { type: "line", id: "l", x1: 12, y1: 13, x2: 14, y2: 15 },
  { type: "text", id: "t", x: 16, y: 17, text: "hello world" },
  { type: "g", id: "g" },
];

describe("ShapeFactory", () => {
  it("constructs all six concrete classes with every required parameter", () => {
    const factory = new ShapeFactory();
    const expected = [
      new Rectangle("r", 1, 2, 3, 4), new Circle("c", 5, 6, 7),
      new Ellipse("e", 8, 9, 10, 11), new Line("l", 12, 13, 14, 15),
      new TextShape("t", 16, 17, "hello world"), new Group("g"),
    ];
    definitions.forEach((request, index) => {
      const shape = factory.create(request);
      expect(shape).toBeInstanceOf(expected[index]!.constructor);
      expect(shape).toEqual(expected[index]);
      expect([shape.fill, shape.stroke, shape.strokeWidth]).toEqual([undefined, undefined, undefined]);
    });
  });

  it.each(definitions)("copies optional style values for $type without retaining input", definition => {
    const request = { ...definition, fill: "red", stroke: "blue", "stroke-width": 2 };
    const factory = new ShapeFactory();
    const first = factory.create(request);
    const second = factory.create(request);
    request.fill = "green";
    request["stroke-width"] = 99;
    first.setAttribute("stroke", "none");
    expect(first).not.toBe(second);
    expect([second.fill, second.stroke, second.strokeWidth]).toEqual(["red", "blue", 2]);
    expect([first.fill, first.strokeWidth]).toEqual(["red", 2]);
  });

  it("allows negative positions, zero dimensions, and empty text", () => {
    const factory = new ShapeFactory();
    expect(factory.create({ type: "rect", id: "r", x: -1, y: -2.5, width: 0, height: 0 }))
      .toEqual(new Rectangle("r", -1, -2.5, 0, 0));
    expect(factory.create({ type: "text", id: "t", x: 0, y: 0, text: "" }))
      .toEqual(new TextShape("t", 0, 0, ""));
  });

  it.each([
    { type: "rect", id: "r", x: 0, y: 0, width: -1, height: 1 },
    { type: "circle", id: "c", cx: NaN, cy: 0, r: 1 },
    { type: "ellipse", id: "e", cx: 0, cy: 0, rx: 1, ry: -1 },
    { type: "line", id: "l", x1: 0, y1: 0, x2: Infinity, y2: 0 },
    { type: "text", id: "t", x: Infinity, y: 0, text: "text" },
    { type: "g", id: "" },
    { type: "g", id: "g", "stroke-width": -1 },
  ] satisfies ShapeDefinition[])("delegates validation to the $type model", request => {
    expect(() => new ShapeFactory().create(request)).toThrow();
  });

  it("reports unknown runtime types", () => {
    const request = { type: "box", id: "b" } as unknown as ShapeDefinition;
    expect(() => new ShapeFactory().create(request))
      .toThrow("unknown shape type: box (is the plugin loaded?)");
  });
});
