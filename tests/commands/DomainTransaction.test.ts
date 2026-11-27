import { describe, expect, it } from "vitest";
import type { AttributeMutation, CommandResult, FeedbackContext, MutationPort } from "../../src/api";
import { CommandHistory } from "../../src/commands/CommandHistory";
import { SvgDocument } from "../support/defaults";
import { Group } from "../../plugins/builtin-shapes/Group";
import { ProbeLeaf, RequiredPartsContainer, composite } from "../support/ContractShapes";

const result: CommandResult = { operation: "move", targetIds: ["compound"], parameters: { dx: 1, dy: 0 } };
function fixture(preparer?: ConstructorParameters<typeof CommandHistory>[0]) {
  const document = new SvgDocument(); document.addShape(new Group("scene"));
  document.addShape(composite(), "scene"); document.addShape(new Group("other"), "scene");
  const history = new CommandHistory(preparer); history.replaceDocumentWithBarrier(document); return history;
}
const state = (history: CommandHistory) => ({ view: history.getDocumentSnapshot().view(),
  undo: history.canUndo, redo: history.canRedo, blocked: history.isBlocked });
function ready(history: CommandHistory) {
  history.executeAction({ execute(port) { port.move("compound", 1, 0); return result; } }); history.undo();
}

describe("domain transactions and commit preparation", () => {
  it.each(["delete", "move-away", "group-part"])("rejects required-part %s and preserves redo", operation => {
    const history = fixture(); ready(history); const before = state(history);
    expect(() => history.executeAction({ execute(port) {
      port.setDefault("compound-part", "value", 99);
      if (operation === "delete") port.deleteShape("compound-part");
      if (operation === "move-away") port.addTo("other", "compound-part");
      if (operation === "group-part") port.group("wrapper", ["compound-part"]);
      return result;
    } })).toThrow("required part is invalid");
    expect(state(history)).toEqual(before); history.redo();
  });
  it("allows nested composites, group collection and complete subtree deletion", () => {
    const history = fixture();
    history.executeAction({ execute(port) {
      port.addShape(composite("inner"), "compound"); port.group("joined", ["compound", "other"]);
      expect(port.parentId("compound")).toBe("joined"); port.move("joined", 1, 0); return result;
    } });
    history.undo(); history.redo();
    history.executeAction({ execute(port) { port.deleteShape("compound"); return result; } });
    expect(history.getDocumentSnapshot().hasShape("inner-part")).toBe(false);
  });
  it.each(["compound", "root-compound"])("rejects ungroup for %s with the exact generic error", id => {
    const history = fixture();
    if (id === "root-compound") history.executeAction({ execute(port) { port.addShape(composite(id)); return result; } });
    const before = state(history);
    expect(() => history.executeAction({ execute(port) { port.ungroup(id); return result; } }))
      .toThrow(`cannot ungroup composite shape: ${id}`);
    expect(state(history)).toEqual(before);
  });
  it("rolls back after several edits throw and expires the failed attribute port", () => {
    const history = fixture(); ready(history); const before = state(history); let retained!: AttributeMutation;
    expect(() => history.executeAttributes({ execute(port) {
      retained = port; port.setDefault("compound-part", "value", 50); port.setDefault("scene", "fill", "red");
      throw new Error("handler failed");
    } })).toThrow("handler failed");
    expect(state(history)).toEqual(before); expect(() => retained.view()).toThrow("expired"); history.redo();
  });
  it("permits intermediate invariant violations repaired within the same transaction", () => {
    const history = fixture();
    history.executeAction({ execute(port) {
      port.deleteShape("compound-part"); port.addShape(new ProbeLeaf("compound-part", 9), "compound"); return result;
    } });
    history.undo(); expect(history.getDocumentSnapshot().getShapeSnapshot("compound-part").attributes().value).toBe(1);
    history.redo(); expect(history.getDocumentSnapshot().getShapeSnapshot("compound-part").attributes().value).toBe(9);
  });
  it.each(["clone", "result"])("keeps document/history/barrier on %s failure", stage => {
    const history = fixture(); const before = state(history);
    expect(() => history.execute({ execute(doc) {
      doc.move("compound", 50, 0);
      if (stage === "clone") doc.clone = () => { throw new Error("clone failure"); };
      return stage === "result" ? { ...result, parameters: { invalid: doc } } as unknown as CommandResult : result;
    } })).toThrow(stage === "clone" ? "clone failure" : "invalid command result parameter");
    expect(state(history)).toEqual(before);
  });
  it("seals the candidate before validate, preventing self mutation", () => {
    class Impure extends ProbeLeaf {
      override clone(): Impure { return new Impure(this.id, this.attributes().value as number); }
      override validate(): void { this.move(1, 0); }
    }
    const history = fixture(); const before = state(history);
    expect(() => history.executeAction({ execute(port) { port.addShape(new Impure("bad")); return result; } })).toThrow();
    expect(state(history)).toEqual(before);
  });
  it("passes validators deep-frozen queries and prevents cross-node mutation", () => {
    class Impure extends ProbeLeaf {
      override clone(): Impure { return new Impure(this.id); }
      override validate(query: Parameters<ProbeLeaf["validate"]>[0]): void {
        (query.find("compound-part")!.attributes as Record<string, number>).value = 100;
      }
    }
    const history = fixture(); const before = state(history);
    expect(() => history.executeAction({ execute(port) { port.addShape(new Impure("bad")); return result; } })).toThrow();
    expect(state(history)).toEqual(before);
  });
  it("rejects asynchronous validation", () => {
    class AsyncValidator extends ProbeLeaf {
      override clone(): AsyncValidator { return new AsyncValidator(this.id); }
      override async validate(): Promise<void> {}
    }
    const history = fixture(); const before = state(history);
    expect(() => history.executeAction({ execute(port) { port.addShape(new AsyncValidator("bad")); return result; } }))
      .toThrow("shape validation must be synchronous and return void");
    expect(state(history)).toEqual(before);
  });
  it("rejects wrong required-part kind during document replacement without clearing history", () => {
    const history = fixture(); ready(history); const before = state(history);
    const node = new RequiredPartsContainer("bad"); node.addChild(new Group("bad-part"));
    const invalid = new SvgDocument(); invalid.addShape(node);
    expect(() => history.replaceDocumentWithBarrier(invalid)).toThrow("required part is invalid");
    expect(state(history)).toEqual(before); history.redo();
  });
  it.each(["execute", "undo", "redo"] as const)("prepares %s before committing/moving stacks", direction => {
    let fail = false; const contexts: FeedbackContext[] = [];
    const history = fixture({ prepare(context) {
      contexts.push(context); expect(Object.isFrozen(context)).toBe(true);
      expect(Object.isFrozen(context.before.roots)).toBe(true);
      if (fail) throw new Error("feedback failed"); return { feedback: [context.direction] };
    } });
    if (direction !== "execute") {
      history.executeAction({ execute(port) { port.move("compound", 1, 0); return result; } });
      if (direction === "redo") history.undo();
    }
    const before = state(history); fail = true; let port!: MutationPort;
    const run = () => direction === "execute" ? history.executeAction({ execute(context) {
      port = context; context.move("compound", 1, 0); return result;
    } }) : history[direction]();
    expect(run).toThrow("feedback failed"); expect(state(history)).toEqual(before);
    if (direction === "execute") expect(() => port.view()).toThrow("expired");
    fail = false; run(); expect(contexts.at(-1)!.direction).toBe(direction);
    if (direction === "undo") {
      const source = contexts.at(-1)!.before.roots[0]!.children[0]!.children[0]!.attributes.value;
      const target = contexts.at(-1)!.after.roots[0]!.children[0]!.children[0]!.attributes.value;
      expect([source, target]).toEqual([2, 1]);
    }
  });
  it.each([undefined, ["bad\nline"], [123], new Promise(() => {})])("rejects invalid prepared feedback %#", feedback => {
    const history = fixture({ prepare: () => ({ feedback }) as never }); const before = state(history);
    expect(() => history.executeAction({ execute(port) { port.move("compound", 1, 0); return result; } }))
      .toThrow("invalid prepared feedback"); expect(state(history)).toEqual(before);
  });
  it("copies prepared feedback and ignores untrusted raw preparedFeedback", () => {
    const lines = ["prepared"]; const history = fixture({ prepare: () => ({ feedback: lines }) });
    const returned = history.executeAction({ execute: () => ({ ...result, preparedFeedback: ["forged"] }) });
    lines[0] = "later mutation"; expect(returned.preparedFeedback).toEqual(["prepared"]);
    expect(Object.isFrozen(returned.preparedFeedback)).toBe(true);
  });
  it("does not rerun edits on undo/redo or store plugin functions in history", () => {
    let calls = 0; const history = fixture();
    history.executeAction({ execute(port) { calls++; port.move("compound", 1, 0); return result; } });
    for (let i = 0; i < 3; i++) { expect(history.undo().command).toEqual(result); history.redo(); }
    expect(calls).toBe(1);
  });
  it("rejects reentrancy from feedback preparation without committing", () => {
    const history = fixture({ prepare() { history.markBarrier(); return { feedback: [] }; } });
    const before = state(history);
    expect(() => history.executeAction({ execute(port) { port.move("compound", 1, 0); return result; } }))
      .toThrow("history operation already in progress"); expect(state(history)).toEqual(before);
  });
});
