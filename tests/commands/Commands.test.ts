import { describe, expect, it } from "vitest";
import { SvgDocument } from "../../src/model/SvgDocument";
import { Group } from "../../src/model/Group";
import { Rectangle } from "../../src/model/Rectangle";
import { Circle } from "../../src/model/Circle";
import { Ellipse } from "../../src/model/Ellipse";
import { Line } from "../../src/model/Line";
import { TextShape } from "../../src/model/TextShape";
import { CreateCommand } from "../../src/commands/CreateCommand";
import { DeleteCommand } from "../../src/commands/DeleteCommand";
import { MoveCommand } from "../../src/commands/MoveCommand";
import { ScaleCommand } from "../../src/commands/ScaleCommand";
import { SetAttributeCommand } from "../../src/commands/SetAttributeCommand";
import { GroupCommand } from "../../src/commands/GroupCommand";
import { UngroupCommand } from "../../src/commands/UngroupCommand";
import { AddToCommand } from "../../src/commands/AddToCommand";
import { FrontCommand } from "../../src/commands/FrontCommand";
import { BackCommand } from "../../src/commands/BackCommand";
import type { Command } from "../../src/commands/Command";

function fixture(): SvgDocument {
  const doc = new SvgDocument();
  doc.addShape(new Group("scene"));
  doc.addShape(new Group("left"), "scene");
  doc.addShape(new Group("right"), "scene");
  doc.addShape(new Rectangle("r", 1, 2, 3, 4, { fill: "red" }), "left");
  doc.addShape(new Circle("c", 5, 6, 7), "left");
  doc.addShape(new TextShape("t", 8, 9, "hello"), "right");
  return doc;
}

function children(doc: SvgDocument, id: string): string[] {
  return (doc.getShapeSnapshot(id) as Group).children.map(child => child.id);
}

describe("editing commands", () => {
  it("creates from an isolated template and returns plain metadata", () => {
    const template = new Group("new");
    template.addChild(new Rectangle("child", 1, 2, 3, 4));
    const command = new CreateCommand(template, "scene");
    template.move(100, 200);
    template.addChild(new Circle("later", 0, 0, 1));
    const doc = fixture();
    expect(command.execute(doc)).toEqual({
      operation: "create", targetIds: ["new"], parameters: { parentId: "scene" },
    });
    expect(doc.getParentId("new")).toBe("scene");
    expect((doc.getShapeSnapshot("child") as Rectangle).x).toBe(1);
    expect(doc.hasShape("later")).toBe(false);
    doc.move("new", 10, 20);
    const another = fixture();
    command.execute(another);
    expect((another.getShapeSnapshot("child") as Rectangle).x).toBe(1);
  });

  it("creates each built-in leaf or empty group without a string factory", () => {
    const templates = [
      new Rectangle("r", 1, 2, 3, 4), new Circle("c", 1, 2, 3),
      new Ellipse("e", 1, 2, 3, 4), new Line("l", 1, 2, 3, 4),
      new TextShape("t", 1, 2, "text"), new Group("g"),
    ];
    const doc = new SvgDocument();
    for (const template of templates) {
      new CreateCommand(template).execute(doc);
      expect(doc.getShapeSnapshot(template.id)).toEqual(template);
      expect(doc.getParentId(template.id)).toBeNull();
    }
  });

  it("deletes an entire subtree", () => {
    const doc = fixture();
    expect(new DeleteCommand("left").execute(doc)).toEqual({ operation: "delete", targetIds: ["left"], parameters: {} });
    expect(children(doc, "scene")).toEqual(["right"]);
    expect(doc.hasShape("r")).toBe(false);
    expect(doc.hasShape("c")).toBe(false);
  });

  it("moves and scales through IDs, including groups", () => {
    const doc = fixture();
    expect(new MoveCommand("left", 2, 3).execute(doc)).toEqual({
      operation: "move", targetIds: ["left"], parameters: { dx: 2, dy: 3 },
    });
    expect(new ScaleCommand("left", 2).execute(doc)).toEqual({
      operation: "scale", targetIds: ["left"], parameters: { factor: 2 },
    });
    const rect = doc.getShapeSnapshot("r") as Rectangle;
    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([6, 10, 6, 8]);
    const circle = doc.getShapeSnapshot("c") as Circle;
    expect([circle.cx, circle.cy, circle.r]).toEqual([14, 18, 14]);
  });

  it("sets numerical attributes, text and group styles", () => {
    const doc = fixture();
    expect(new SetAttributeCommand("r", "width", "12.5").execute(doc)).toEqual({
      operation: "set", targetIds: ["r"], parameters: { name: "width", value: "12.5" },
    });
    new SetAttributeCommand("t", "text", "updated").execute(doc);
    new SetAttributeCommand("left", "fill", "blue").execute(doc);
    expect((doc.getShapeSnapshot("r") as Rectangle).width).toBe(12.5);
    expect((doc.getShapeSnapshot("t") as TextShape).text).toBe("updated");
    expect(doc.getShapeSnapshot("r").fill).toBe("red");
    expect(doc.getShapeSnapshot("left").fill).toBe("blue");
  });

  it("copies group members and groups in document order, then ungroups in place", () => {
    const doc = fixture();
    const members = ["t", "r"];
    const command = new GroupCommand("joined", members);
    members.splice(0, members.length, "missing");
    expect(command.execute(doc)).toEqual({
      operation: "group", targetIds: ["joined"], parameters: { memberIds: ["t", "r"] },
    });
    expect(children(doc, "scene")).toEqual(["joined", "left", "right"]);
    expect(children(doc, "joined")).toEqual(["r", "t"]);
    expect(new UngroupCommand("joined").execute(doc)).toEqual({
      operation: "ungroup", targetIds: ["joined"], parameters: {},
    });
    expect(children(doc, "scene")).toEqual(["r", "t", "left", "right"]);
  });

  it("moves a subtree between parents", () => {
    const doc = fixture();
    expect(new AddToCommand("right", "left").execute(doc)).toEqual({
      operation: "addto", targetIds: ["left"], parameters: { groupId: "right" },
    });
    expect(children(doc, "scene")).toEqual(["right"]);
    expect(children(doc, "right")).toEqual(["t", "left"]);
    expect(doc.getParentId("r")).toBe("left");
  });

  it("implements front as last sibling and back as first sibling", () => {
    const doc = fixture();
    expect(new FrontCommand("r").execute(doc)).toEqual({ operation: "front", targetIds: ["r"], parameters: {} });
    expect(children(doc, "left")).toEqual(["c", "r"]);
    expect(new BackCommand("r").execute(doc)).toEqual({ operation: "back", targetIds: ["r"], parameters: {} });
    expect(children(doc, "left")).toEqual(["r", "c"]);
  });

  const invalid: Command[] = [
    new CreateCommand(new Circle("r", 0, 0, 1)), new DeleteCommand("missing"),
    new MoveCommand("r", Infinity, 0), new ScaleCommand("r", 0),
    new SetAttributeCommand("r", "width", ""), new GroupCommand("g", ["left", "r"]),
    new UngroupCommand("scene"), new AddToCommand("left", "scene"),
    new FrontCommand("missing"), new BackCommand("missing"),
  ];
  it.each(invalid.map(command => [command.constructor.name, command] as const))(
    "%s propagates model errors without changing the document", (_name, command) => {
      const doc = fixture();
      const before = doc.getRootSnapshots();
      expect(() => command.execute(doc)).toThrow();
      expect(doc.getRootSnapshots()).toEqual(before);
    },
  );
});
