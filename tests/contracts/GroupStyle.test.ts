import { expect, it } from "vitest";
import { Editor } from "../../src/services/Editor";

it("project R4: reparenting preserves explicit styles but changes the source of inherited styles", () => {
  const e = new Editor(); e.init();
  e.create({ type: "g", id: "scene" });
  e.create({ type: "g", id: "red", parentId: "scene", fill: "red", stroke: "black", "stroke-width": 2 });
  e.create({ type: "g", id: "blue", parentId: "scene", fill: "blue", stroke: "white", "stroke-width": 4 });
  e.create({ type: "rect", id: "plain", parentId: "red", x: 0, y: 0, width: 1, height: 1 });
  e.create({ type: "rect", id: "explicit", parentId: "red", x: 1, y: 1, width: 2, height: 2, fill: "green", stroke: "yellow", "stroke-width": 3 });
  const explicit = { ...e.show("explicit").attributes };
  const original = e.tree();
  e.addTo("blue", "plain"); e.addTo("blue", "explicit");
  expect(e.show("plain").parentId).toBe("blue");
  expect(e.show("plain").attributes).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  expect(e.show("blue").attributes).toEqual({ fill: "blue", stroke: "white", "stroke-width": 4 });
  expect(e.show("explicit").attributes).toEqual(explicit);
  expect(e.tree("blue").children.map(s => s.id)).toEqual(["plain", "explicit"]);
  e.undo(); e.undo(); expect(e.tree()).toEqual(original);
  e.redo(); e.redo();
  e.group("joined", ["explicit", "plain"]);
  expect(e.tree("joined").children.map(s => s.id)).toEqual(["plain", "explicit"]);
  expect(e.show("joined").parentId).toBe("blue");
  expect(e.show("joined").attributes).toEqual({});
  expect(e.show("explicit").attributes).toEqual(explicit);
  e.setAttribute("joined", "fill", "gold");
  expect(e.show("plain").attributes).not.toHaveProperty("fill");
  expect(e.show("explicit").attributes.fill).toBe("green");
  e.ungroup("joined");
  expect(e.show("plain").parentId).toBe("blue");
  expect(e.show("plain").attributes).not.toHaveProperty("fill");
  e.ungroup("blue");
  expect(e.show("plain").parentId).toBe("scene");
  expect(e.show("scene").attributes).toEqual({});
  expect(e.show("plain").attributes).not.toHaveProperty("fill");
  expect(e.show("explicit").attributes).toEqual(explicit);
  expect(e.tree("scene").children.map(s => s.id)).toEqual(["red", "plain", "explicit"]);
  // No computed-style engine is assumed: the assertions establish the SVG inheritance
  // inputs (parent and explicit/absent attributes), not browser-rendered pixels.
  e.undo(); expect(e.show("plain").parentId).toBe("blue");
});
