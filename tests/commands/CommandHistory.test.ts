import { afterEach, describe, expect, it, vi } from "vitest";
import { SvgDocument } from "../../src/model/SvgDocument";
import { Group } from "../../src/model/Group";
import { Rectangle } from "../../src/model/Rectangle";
import { Circle } from "../../src/model/Circle";
import { Ellipse } from "../../src/model/Ellipse";
import { Line } from "../../src/model/Line";
import { TextShape } from "../../src/model/TextShape";
import { CommandHistory } from "../../src/commands/CommandHistory";
import { DocumentViewBuilder } from "../../src/commands/DocumentViewBuilder";
import type { DocumentView, ShapeView } from "../../src/commands/DocumentViewBuilder";
import type { Command } from "../../src/commands/Command";
import type { CommandResult } from "../../src/commands/CommandResult";
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

function fixture(): CommandHistory {
  const doc = new SvgDocument(400, 300);
  doc.addShape(new Group("scene", { fill: "blue", "stroke-width": 2 }));
  doc.addShape(new Group("left"), "scene");
  doc.addShape(new Group("right"), "scene");
  doc.addShape(new Rectangle("r", 1, 2, 3, 4, { fill: "red" }), "left");
  doc.addShape(new Circle("c", 5, 6, 7), "left");
  doc.addShape(new TextShape("t", 8, 9, "hello"), "right");
  const history = new CommandHistory();
  history.replaceDocumentWithBarrier(doc);
  return history;
}

function view(history: CommandHistory): DocumentView {
  return DocumentViewBuilder.capture(history.getDocumentSnapshot());
}
function status(history: CommandHistory) {
  return { view: view(history), undo: history.canUndo, redo: history.canRedo, blocked: history.isBlocked };
}
function find(view: DocumentView, id: string): ShapeView | undefined {
  const visit = (nodes: readonly ShapeView[]): ShapeView | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const nested = visit(node.children);
      if (nested) return nested;
    }
    return undefined;
  };
  return visit(view.roots);
}
const result: CommandResult = { operation: "move", targetIds: ["r"], parameters: { dx: 1, dy: 0 } };

afterEach(() => vi.restoreAllMocks());

describe("CommandHistory", () => {
  it("starts without a document and rejects operations that need one", () => {
    const history = new CommandHistory();
    expect(history.hasDocument).toBe(false);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.isBlocked).toBe(false);
    for (const operation of [
      () => history.execute(new MoveCommand("r", 1, 0)), () => history.undo(),
      () => history.redo(), () => history.getDocumentSnapshot(), () => history.markBarrier(),
    ]) expect(operation).toThrow("no document. use 'init' or 'read' first");
  });

  it("sets a barrier when a document is installed and returns defensive snapshots", () => {
    const doc = new SvgDocument();
    doc.addShape(new Circle("c", 1, 2, 3));
    const history = new CommandHistory();
    history.replaceDocumentWithBarrier(doc);
    doc.deleteShape("c");
    const snapshot = history.getDocumentSnapshot();
    snapshot.deleteShape("c");
    snapshot.resize(1, 1);
    expect(history.getDocumentSnapshot().hasShape("c")).toBe(true);
    expect(history.getDocumentSnapshot().width).toBe(800);
    expect(history.hasDocument).toBe(true);
    expect(history.isBlocked).toBe(true);
    expect(() => history.undo()).toThrow("undo not allowed after io command");
    expect(() => history.redo()).toThrow("undo not allowed after io command");
  });

  it("restores versions in order and includes direction and restored geometry", () => {
    const history = fixture();
    history.execute(new MoveCommand("r", 10, 20));
    history.execute(new ScaleCommand("r", 2));
    const firstUndo = history.undo();
    expect(firstUndo.direction).toBe("undo");
    expect(firstUndo.command.operation).toBe("scale");
    expect(find(firstUndo.restored, "r")?.attributes).toEqual({ fill: "red", x: 11, y: 22, width: 3, height: 4 });
    const secondUndo = history.undo();
    expect(find(secondUndo.restored, "r")?.attributes.x).toBe(1);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
    expect(() => history.undo()).toThrow("nothing to undo");
    expect(find(history.redo().restored, "r")?.attributes.x).toBe(11);
    const last = history.redo();
    expect(last.direction).toBe("redo");
    expect(find(last.restored, "r")?.attributes).toEqual({ fill: "red", x: 22, y: 44, width: 6, height: 8 });
    expect(history.canRedo).toBe(false);
    expect(() => history.redo()).toThrow("nothing to redo");
  });

  it("never reexecutes a command during undo or redo", () => {
    const history = fixture();
    const execute = vi.fn((doc: SvgDocument) => { doc.move("r", 1, 0); return result; });
    history.execute({ execute });
    execute.mockImplementation(() => { throw new Error("must not execute again"); });
    for (let i = 0; i < 3; i++) { history.undo(); history.redo(); }
    expect(execute).toHaveBeenCalledTimes(1);
    expect(find(view(history), "r")?.attributes.x).toBe(2);
  });

  it("keeps a partially executed failing command out of document and history", () => {
    const history = fixture();
    history.execute(new MoveCommand("r", 1, 0));
    const before = status(history);
    expect(() => history.execute({ execute(doc) {
      doc.move("r", 100, 200);
      doc.deleteShape("right");
      doc.resize(10, 20);
      throw new Error("failed after several changes");
    } })).toThrow("failed after several changes");
    expect(status(history)).toEqual(before);
    history.undo();
    expect(find(view(history), "r")?.attributes.x).toBe(1);
    expect(history.canUndo).toBe(false);
  });

  it("preserves Redo after failure and clears it only after successful editing", () => {
    const history = fixture();
    history.execute(new MoveCommand("r", 10, 0));
    history.undo();
    const before = status(history);
    expect(() => history.execute({ execute(doc) {
      doc.move("r", 100, 0);
      throw new Error("fail");
    } })).toThrow();
    expect(status(history)).toEqual(before);
    history.redo();
    expect(find(view(history), "r")?.attributes.x).toBe(11);
    history.undo();
    history.execute(new SetAttributeCommand("r", "fill", "green"));
    expect(history.canRedo).toBe(false);
    expect(() => history.redo()).toThrow("nothing to redo");
  });

  it("does not release a barrier for a failed command", () => {
    const history = fixture();
    const before = status(history);
    expect(() => history.execute(new DeleteCommand("missing"))).toThrow();
    expect(status(history)).toEqual(before);
    expect(() => history.undo()).toThrow("undo not allowed after io command");
    expect(() => history.redo()).toThrow("undo not allowed after io command");
  });

  it("clears both stacks at a barrier and starts a fresh history after it", () => {
    const history = fixture();
    history.execute(new MoveCommand("r", 10, 0));
    history.execute(new MoveCommand("r", 20, 0));
    history.undo(); // both stacks are nonempty
    const beforeBarrier = view(history);
    history.markBarrier();
    expect(view(history)).toEqual(beforeBarrier);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    history.execute(new MoveCommand("r", 5, 0));
    expect(history.isBlocked).toBe(false);
    history.undo();
    expect(view(history)).toEqual(beforeBarrier);
    expect(() => history.undo()).toThrow("nothing to undo");
  });

  it("replaces documents without allowing history to cross the replacement", () => {
    const history = fixture();
    history.execute(new MoveCommand("r", 1, 0));
    history.replaceDocumentWithBarrier(new SvgDocument(10, 20));
    history.execute(new CreateCommand(new Circle("new", 1, 2, 3)));
    const restored = history.undo().restored;
    expect(restored).toEqual({ width: 10, height: 20, roots: [] });
    expect(history.canUndo).toBe(false);
  });

  it("records successful no-op commands and releases barriers", () => {
    const history = fixture();
    const initial = view(history);
    history.execute(new MoveCommand("r", 0, 0));
    expect(view(history)).toEqual(initial);
    expect(history.canUndo).toBe(true);
    expect(history.isBlocked).toBe(false);
    history.undo();
    expect(history.canRedo).toBe(true);
    history.execute(new BackCommand("r"));
    expect(history.canRedo).toBe(false);
    expect(history.canUndo).toBe(true);
    expect(view(history)).toEqual(initial);
  });

  it("isolates retained command work references from current and historical versions", () => {
    const history = fixture();
    let retained: SvgDocument | undefined;
    history.execute({ execute(doc) {
      retained = doc;
      doc.move("r", 1, 0);
      return result;
    } });
    const committed = view(history);
    retained!.deleteShape("scene");
    retained!.resize(1, 1);
    expect(view(history)).toEqual(committed);
    history.undo();
    expect(find(view(history), "r")?.attributes.x).toBe(1);
    history.redo();
    expect(view(history)).toEqual(committed);
  });

  it("copies raw result arrays and deeply freezes returned metadata and restored views", () => {
    const history = fixture();
    const targets = ["r"];
    const members = ["r", "c"];
    const parameters = { memberIds: members, dx: 1 };
    const returned = history.execute({ execute(doc) {
      doc.move("r", 1, 0);
      return { operation: "move", targetIds: targets, parameters };
    } });
    targets.push("bad");
    members[0] = "bad";
    parameters.dx = 999;
    expect(returned.targetIds).toEqual(["r"]);
    expect(returned.parameters).toEqual({ memberIds: ["r", "c"], dx: 1 });
    expect(() => (returned.targetIds as string[]).push("bad")).toThrow();
    expect(() => (returned.parameters.memberIds as string[]).push("bad")).toThrow();
    const undo = history.undo();
    expect(undo.command).toEqual(returned);
    expect(Object.isFrozen(undo)).toBe(true);
    expect(Object.isFrozen(undo.restored)).toBe(true);
    expect(Object.isFrozen(undo.restored.roots)).toBe(true);
    const restoredRect = find(undo.restored, "r")!;
    expect(Object.isFrozen(restoredRect)).toBe(true);
    expect(Object.isFrozen(restoredRect.children)).toBe(true);
    expect(() => { (restoredRect.attributes as Record<string, number>).x = 999; }).toThrow();
    expect(find(history.redo().restored, "r")?.attributes.x).toBe(2);
  });

  it("preserves all state when defensive cloning after execution fails", () => {
    const history = fixture();
    history.execute(new MoveCommand("r", 1, 0));
    history.undo();
    const before = status(history);
    expect(() => history.execute({ execute(doc) {
      doc.move("r", 100, 0);
      vi.spyOn(doc, "clone").mockImplementation(() => { throw new Error("clone failed"); });
      return result;
    } })).toThrow("clone failed");
    expect(status(history)).toEqual(before);
    history.redo();
    expect(find(view(history), "r")?.attributes.x).toBe(2);
  });

  it("preserves the barrier if result preparation fails after command execution", () => {
    const history = fixture();
    const before = status(history);
    expect(() => history.execute({ execute(doc) {
      doc.move("r", 100, 0);
      return { operation: "move", targetIds: ["r"], get parameters(): never { throw new Error("result failed"); } };
    } })).toThrow("result failed");
    expect(status(history)).toEqual(before);
  });

  it("rejects domain objects in result parameters before committing", () => {
    const history = fixture();
    const before = status(history);
    expect(() => history.execute({ execute(doc) {
      doc.move("r", 100, 0);
      return { operation: "move", targetIds: ["r"], parameters: { unsafe: doc } } as unknown as CommandResult;
    } })).toThrow("invalid command result parameter");
    expect(status(history)).toEqual(before);
  });

  it("keeps the current document and history when replacement cloning fails", () => {
    const history = fixture();
    history.execute(new MoveCommand("r", 1, 0));
    const before = status(history);
    const bad = new SvgDocument();
    vi.spyOn(bad, "clone").mockImplementation(() => { throw new Error("clone failed"); });
    expect(() => history.replaceDocumentWithBarrier(bad)).toThrow("clone failed");
    expect(status(history)).toEqual(before);
  });

  it.each(["undo", "redo"] as const)("does not move stacks if %s result construction fails", direction => {
    const history = fixture();
    history.execute(new MoveCommand("r", 1, 0));
    if (direction === "redo") history.undo();
    const before = status(history);
    const spy = vi.spyOn(DocumentViewBuilder, "capture").mockImplementation(() => { throw new Error("view failed"); });
    expect(() => history[direction]()).toThrow("view failed");
    spy.mockRestore();
    expect(status(history)).toEqual(before);
    history[direction]();
    expect(find(view(history), "r")?.attributes.x).toBe(direction === "undo" ? 1 : 2);
  });

  it("rejects reentrant history changes rather than partially committing", () => {
    const history = fixture();
    const before = status(history);
    expect(() => history.execute({ execute(doc) {
      doc.move("r", 100, 0);
      history.markBarrier();
      return result;
    } })).toThrow("history operation already in progress");
    expect(status(history)).toEqual(before);
    history.execute(new MoveCommand("r", 1, 0));
    expect(history.canUndo).toBe(true);
  });

  const commands: Command[] = [
    new CreateCommand(new Ellipse("e", 1, 2, 3, 4), "left"),
    new DeleteCommand("left"), new MoveCommand("scene", 1, 2), new ScaleCommand("scene", 2),
    new SetAttributeCommand("t", "text", "changed"), new GroupCommand("joined", ["t", "r"]),
    new UngroupCommand("left"), new AddToCommand("right", "left"),
    new FrontCommand("r"), new BackCommand("c"),
  ];
  it.each(commands.map(command => [command.constructor.name, command] as const))(
    "%s is exactly one undo unit with complete structural restoration", (_name, command) => {
      const history = fixture();
      const before = view(history);
      history.execute(command);
      const after = view(history);
      expect(after).not.toEqual(before);
      const undo = history.undo();
      expect(undo.restored).toEqual(before);
      expect(view(history)).toEqual(before);
      expect(history.canUndo).toBe(false);
      const redo = history.redo();
      expect(redo.restored).toEqual(after);
      expect(view(history)).toEqual(after);
      expect(history.canRedo).toBe(false);
    },
  );

  it("reports creation/deletion and parent/order restoration rather than repeating success text", () => {
    const history = fixture();
    history.execute(new DeleteCommand("left"));
    const undo = history.undo();
    expect(undo.direction).toBe("undo");
    expect(find(undo.restored, "r")?.parentId).toBe("left");
    expect(find(undo.restored, "left")?.children.map(child => child.id)).toEqual(["r", "c"]);
    const redo = history.redo();
    expect(find(redo.restored, "left")).toBeUndefined();
    expect(find(redo.restored, "r")).toBeUndefined();
  });

  it("captures all built-in attributes as plain immutable data", () => {
    const history = fixture();
    history.execute(new CreateCommand(new Ellipse("e", 1, 2, 3, 4, { stroke: "green" })));
    history.execute(new CreateCommand(new Line("l", 5, 6, 7, 8, { "stroke-width": 3 })));
    history.undo();
    const restored = history.redo().restored;
    expect([restored.width, restored.height]).toEqual([400, 300]);
    expect(find(restored, "e")?.attributes).toEqual({ cx: 1, cy: 2, rx: 3, ry: 4, stroke: "green" });
    expect(find(restored, "l")?.attributes).toEqual({ x1: 5, y1: 6, x2: 7, y2: 8, "stroke-width": 3 });
    expect(find(restored, "c")?.attributes).toEqual({ cx: 5, cy: 6, r: 7 });
    expect(find(restored, "t")?.attributes).toEqual({ x: 8, y: 9, text: "hello" });
    expect(find(restored, "scene")?.attributes).toEqual({ fill: "blue", "stroke-width": 2 });
    expect(find(restored, "r")?.type).toBe("Rectangle");
    expect(Object.getPrototypeOf(find(restored, "r"))).toBe(Object.prototype);
  });
});
