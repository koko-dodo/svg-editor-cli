import { describe, expect, it } from "vitest";
import * as api from "../../src/api";
import type { AttributeMutation, CommandResult, DocumentQuery, MutationPort } from "../../src/api";
import { CommandHistory } from "../../src/commands/CommandHistory";
import { SvgDocument } from "../../src/model/SvgDocument";
import { Editor } from "../../src/services/Editor";
import { ProbeLeaf, composite } from "../support/ContractShapes";

const result: CommandResult = { operation: "move", targetIds: ["p"], parameters: { dx: 1 } };
function fixture() {
  const doc = new SvgDocument(); doc.addShape(new ProbeLeaf("p"));
  const history = new CommandHistory(); history.replaceDocumentWithBarrier(doc); return history;
}

// Checked by the root TypeScript build, never executed.
function typeBoundary(query: DocumentQuery, attributes: AttributeMutation) {
  // @ts-expect-error Read-only queries cannot edit.
  query.setDefault("p", "value", 2);
  // @ts-expect-error Attribute handlers cannot delete.
  attributes.deleteShape("p");
  // @ts-expect-error No history control is a plugin capability.
  attributes.undo();
  // @ts-expect-error Preserve the existing strong operation union.
  const invalid: CommandResult = { operation: "arbitrary", targetIds: [], parameters: {} };
  return invalid;
}
void typeBoundary;

describe("public domain API", () => {
  it("exports only model abstractions at runtime, not application ownership", () => {
    expect(Object.keys(api).sort()).toEqual(["ContainerShape", "Shape"]);
    expect(new ProbeLeaf("p").kind).toBe("probe-leaf");
  });
  it("supports an independent plugin model and deep-frozen scalar queries", () => {
    const history = fixture();
    history.executeAction({ execute(port) {
      port.addShape(composite());
      const view = port.view();
      const node = port.find("compound")!;
      for (const value of [view, view.roots, node, node.attributes, node.children, node.children[0], node.children[0]!.attributes]) {
        expect(Object.isFrozen(value)).toBe(true);
      }
      expect(node.kind).toBe("required-parts"); expect(node.container).toBe(true);
      expect(port.parentId("compound-part")).toBe("compound");
      expect(port.parentId("compound")).toBeNull();
      expect(port.find("missing")).toBeUndefined();
      expect(() => port.parentId("missing")).toThrow("no such shape: missing");
      expect(() => (node.attributes as Record<string, number>).value = 99).toThrow();
      return result;
    } });
  });
  it.each([false, true])("expires all borrowed methods after action failure=%s", fail => {
    const history = fixture(); let retained!: MutationPort;
    const execute = () => history.executeAction({ execute(port) {
      retained = port; port.move("p", 1, 0);
      if (fail) throw new Error("partial failure"); return result;
    } });
    if (fail) expect(execute).toThrow("partial failure"); else execute();
    const calls = [() => retained.view(), () => retained.find("p"), () => retained.parentId("p"),
      () => retained.addShape(new ProbeLeaf("q")), () => retained.deleteShape("p"),
      () => retained.move("p", 1, 0), () => retained.scale("p", 2),
      () => retained.setDefault("p", "value", 9), () => retained.group("g", ["p"]),
      () => retained.ungroup("g"), () => retained.addTo("g", "p"),
      () => retained.bringToFront("p"), () => retained.sendToBack("p")];
    for (const call of calls) expect(call).toThrow("editing context has expired");
    expect(history.getDocumentSnapshot().view().roots[0]!.attributes.value).toBe(fail ? 1 : 2);
  });
  it("provides a truly narrower, also expiring attribute port", () => {
    const history = fixture(); let held!: AttributeMutation;
    history.executeAttributes({ execute(port) {
      held = port; expect(Object.keys(port).sort()).toEqual(["find", "parentId", "setDefault", "view"]);
      port.setDefault("p", "value", 4); expect(port.find("p")!.attributes.value).toBe(4); return result;
    } });
    expect(() => held.setDefault("p", "value", 5)).toThrow("expired");
    history.undo(); expect(history.getDocumentSnapshot().view().roots[0]!.attributes.value).toBe(1);
    history.redo(); expect(history.getDocumentSnapshot().view().roots[0]!.attributes.value).toBe(4);
  });
  it("isolates inserted nodes retained by the plugin from current and historical versions", () => {
    const history = fixture(); const input = composite(); const part = input.children[0]!;
    history.executeAction({ execute(port) { port.addShape(input); return result; } });
    input.removeChild(part); part.move(100, 0);
    const check = () => expect(history.getDocumentSnapshot().view().roots[1]!.children[0]!.attributes.value).toBe(1);
    check(); history.undo(); history.redo(); check();
  });
  it("does not leak result, parameter, target or owner references", () => {
    const history = fixture(); const targets = ["p"]; const members = ["p"];
    const parameters = { members, dx: 1 }; const owner = { category: "shapes" as const, name: "probe" };
    const returned = history.executeAction({ execute(port) {
      port.move("p", 1, 0); return { operation: "move", targetIds: targets, parameters, feedbackOwner: owner };
    } });
    targets.push("bad"); members.push("bad"); parameters.dx = 100; owner.name = "bad";
    expect(returned.targetIds).toEqual(["p"]); expect(returned.parameters).toEqual({ members: ["p"], dx: 1 });
    expect(returned.feedbackOwner!.name).toBe("probe"); expect(Object.isFrozen(returned.feedbackOwner)).toBe(true);
    expect(history.undo().command).toEqual(returned);
  });
  it("keeps old immutable views independent of subsequent work", () => {
    const history = fixture();
    history.executeAction({ execute(port) {
      const view = port.find("p")!; port.move("p", 2, 0);
      expect(view.attributes.value).toBe(1); expect(port.find("p")!.attributes.value).toBe(3); return result;
    } });
  });
  it("allows the trusted Editor to execute a scoped plugin action", () => {
    const editor = new Editor(); editor.init();
    editor.executeAction({ execute(port) { port.addShape(new ProbeLeaf("p")); return result; } });
    editor.executeAttributes({ execute(port) { port.setDefault("p", "value", 4); return result; } });
    expect(editor.tree("p").kind).toBe("probe-leaf"); editor.undo();
    expect(editor.tree("p").attributes.value).toBe(1);
  });
});

it("rejects async plugin actions, expires their ports and consumes delayed rejection", async () => {
  const doc = new SvgDocument(); doc.addShape(new ProbeLeaf("p"));
  const history = new CommandHistory(); history.replaceDocumentWithBarrier(doc);
  expect(() => history.executeAction({ async execute(port: MutationPort) {
    port.move("p", 1, 0); await Promise.resolve(); port.move("p", 1, 0); return result;
  } } as never)).toThrow("editing action must be synchronous");
  await Promise.resolve(); await Promise.resolve();
  expect(history.getDocumentSnapshot().view().roots[0]!.attributes.value).toBe(1);
  expect(history.isBlocked).toBe(true);
});
