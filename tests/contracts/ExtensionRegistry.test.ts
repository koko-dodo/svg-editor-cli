import { describe, expect, it } from "vitest";
import type {
  AttributeMatchContext, AttributeMutation, CommandToken,
  QueryCommandContext, RegistrationContext, RenderingServices, TreeDecorator,
} from "../../src/api";
import { ExtensionRegistry } from "../../src/extensions/ExtensionRegistry";
import { CommandHistory } from "../../src/commands/CommandHistory";
import { SvgDocument } from "../../src/model/SvgDocument";
import { queryView } from "../../src/model/DocumentView";
import { ProbeLeaf } from "../support/ContractShapes";
import { activateProbe, ProbeAttribute, ProbeDecorator, ProbeEditCommand, ProbeProvider, ProbeQueryCommand } from "../support/RegistryExtensions";

const tokens = (...values: string[]): CommandToken[] => values.map(value => ({ value, quoted: false, column: 1 }));
const rendering: RenderingServices = { tree: () => ["tree"], show: node => [node.kind] };
function historyFixture() {
  const doc = new SvgDocument(); doc.addShape(new ProbeLeaf("p"));
  const history = new CommandHistory(); history.replaceDocumentWithBarrier(doc); return history;
}
const state = (history: CommandHistory) => ({ view: history.getDocumentSnapshot().view(), undo: history.canUndo, redo: history.canRedo, blocked: history.isBlocked });
const query = (history: CommandHistory) => queryView(history.getDocumentSnapshot().view());
const baseSelector = { namespace: "urn:test:svg", localName: "probe" };

function typeBoundaries(context: RegistrationContext, match: AttributeMatchContext, attributes: AttributeMutation, command: QueryCommandContext) {
  // @ts-expect-error Registration is not a mutable registry map.
  context.shapes.set("bad", new ProbeProvider());
  // @ts-expect-error Match receives no mutation method.
  match.document.setDefault("p", "value", 2);
  // @ts-expect-error Attribute handlers cannot structurally edit.
  attributes.deleteShape("p");
  // @ts-expect-error Query command receives no editing authority.
  command.document?.setDefault("p", "value", 2);
}
void typeBoundaries;

describe("extension registry contracts", () => {
  it("registers all four public, class-based test extensions and exposes frozen names", () => {
    const registry = new ExtensionRegistry(); const names = registry.register(activateProbe);
    expect(names).toEqual({ shapes: ["probe-leaf"], commands: ["inspect-probe", "tweak-probe"], decorators: ["probe-tag"], attributes: ["probe-pair"] });
    expect(registry.contributions()).toEqual(names);
    expect(Object.isFrozen(names)).toBe(true);
    for (const list of Object.values(names)) expect(Object.isFrozen(list)).toBe(true);
    expect(() => (names.shapes as string[]).push("bad")).toThrow();
    expect(registry.shape("missing")).toBeUndefined(); expect(registry.command("missing")).toBeUndefined();
    expect(registry.attribute("missing")).toBeUndefined();
  });
  it("consumes provider parsing, construction, SVG data, presentation and feedback contracts", () => {
    const registry = new ExtensionRegistry(); registry.register(activateProbe);
    const services = registry.shapeServices(); const parsed = services.parseCreate("probe-leaf", tokens("7"));
    const shape = services.create("probe-leaf", "p", parsed.parameters);
    const doc = new SvgDocument(); doc.addShape(shape); const view = doc.view(); const node = view.roots[0]!;
    const provider = registry.shape("probe-leaf")!;
    const xml = provider.write(node);
    expect(provider.read(xml, "p", [], services).attributes()).toEqual(node.attributes);
    expect(provider.present(node).summary).toBe("value=7");
    expect(services.readAttribute(node, "value")).toBe(7);
    expect(provider.describeOperation!({ direction: "undo", before: view, after: view,
      result: { operation: "move", targetIds: ["p"], parameters: {} } })).toEqual(["probe undo"]);
    expect(Object.isFrozen(services)).toBe(true);
    expect(() => services.parseCreate("missing", [])).toThrow("unknown shape: missing");
    expect(() => services.parseCreate("probe-leaf", [])).toThrow("invalid probe arguments");
  });
  it("uses exact namespace/localName/dataKind keys and base fallback without swallowing read errors", () => {
    const registry = new ExtensionRegistry(); const semantic = { ...baseSelector, dataKind: "semantic" };
    registry.register(context => { context.registerShape(new ProbeProvider()); context.registerShape(new ProbeProvider("semantic", semantic)); });
    expect(registry.shapeForSvg(semantic)?.kind).toBe("semantic");
    expect(registry.shapeForSvg({ ...baseSelector, dataKind: "unknown" })?.kind).toBe("probe-leaf");
    expect(registry.shapeForSvg({ ...baseSelector, namespace: "urn:other" })).toBeUndefined();
    expect(registry.shapeForSvg({ ...baseSelector, localName: "Probe" })).toBeUndefined();
    const strict = new ProbeProvider("strict", { ...baseSelector, dataKind: "strict" });
    strict.read = () => { throw new Error("invalid semantic content"); };
    registry.register(context => context.registerShape(strict));
    expect(() => registry.shapeForSvg(strict.svg)!.read({ ...baseSelector, attributes: {}, text: "" }, "p", [], registry.shapeServices()))
      .toThrow("invalid semantic content");
  });
  it("does not downgrade an unknown element without a matching base provider", () => {
    const registry = new ExtensionRegistry(); registry.register(context => context.registerShape(new ProbeProvider("semantic", { ...baseSelector, dataKind: "semantic" })));
    expect(registry.shapeForSvg(baseSelector)).toBeUndefined();
    expect(registry.shapeForSvg({ ...baseSelector, dataKind: "missing" })).toBeUndefined();
  });
  it.each(["shapes", "commands", "decorators", "attributes"] as const)("rejects duplicate %s without overwriting existing entries", category => {
    const registry = new ExtensionRegistry(); registry.register(activateProbe); const before = registry.contributions();
    const register = (context: RegistrationContext) => {
      context.registerCommand(new ProbeQueryCommand("fresh"));
      if (category === "shapes") context.registerShape(new ProbeProvider());
      if (category === "commands") context.registerCommand(new ProbeQueryCommand());
      if (category === "decorators") context.registerDecorator(new ProbeDecorator("probe-tag", "bad"));
      if (category === "attributes") context.registerAttribute(new ProbeAttribute());
    };
    const name = before[category][0]!;
    expect(() => registry.register(register)).toThrow(`duplicate registration: ${category}/${name}`);
    expect(registry.contributions()).toEqual(before); expect(registry.command("fresh")).toBeUndefined();
    expect(registry.treeTags({ document: new SvgDocument().view(), saved: null, node: null })).toEqual(["(probe)"]);
  });
  it("rejects duplicates within one contribution batch atomically", () => {
    const registry = new ExtensionRegistry();
    expect(() => registry.register(context => { context.registerCommand(new ProbeQueryCommand()); context.registerCommand(new ProbeQueryCommand()); }))
      .toThrow("duplicate registration: commands/inspect-probe");
    expect(registry.contributions().commands).toEqual([]);
  });
  it("allows identical names in distinct categories", () => {
    const registry = new ExtensionRegistry(); registry.register(context => {
      context.registerCommand(new ProbeQueryCommand("same")); context.registerDecorator(new ProbeDecorator("same", "tag"));
    }); expect(registry.contributions().commands).toEqual(["same"]); expect(registry.contributions().decorators).toEqual(["same"]);
  });
  it.each([false, true])("rejects selector collision within current batch=%s", sameBatch => {
    const registry = new ExtensionRegistry();
    if (!sameBatch) registry.register(context => context.registerShape(new ProbeProvider()));
    const before = registry.contributions();
    expect(() => registry.register(context => {
      if (sameBatch) context.registerShape(new ProbeProvider());
      context.registerShape(new ProbeProvider("other"));
    })).toThrow("duplicate svg selector:");
    expect(registry.contributions()).toEqual(before); expect(registry.shape("other")).toBeUndefined();
  });
  it("keeps staged contributions invisible until validation and one atomic commit", () => {
    const registry = new ExtensionRegistry(); let held!: RegistrationContext;
    registry.register(context => {
      held = context; activateProbe(context); expect(registry.shape("probe-leaf")).toBeUndefined();
      expect(Object.isFrozen(context)).toBe(true);
      expect(Object.keys(context).sort()).toEqual(["registerAttribute", "registerCommand", "registerDecorator", "registerShape"]);
    }, contributions => {
      expect(contributions.shapes).toEqual(["probe-leaf"]); expect(registry.shape("probe-leaf")).toBeUndefined();
      expect(() => held.registerCommand(new ProbeQueryCommand("late"))).toThrow("expired");
    });
    expect(registry.shape("probe-leaf")).toBeDefined(); expect(Object.keys(registry)).toEqual([]);
    expect(() => held.registerShape(new ProbeProvider())).toThrow("expired");
  });
  it("rolls back activation and host-validation failures and permits later registration", () => {
    const registry = new ExtensionRegistry(); registry.register(context => context.registerCommand(new ProbeQueryCommand("old")));
    const before = registry.contributions(); let held!: RegistrationContext;
    expect(() => registry.register(context => { held = context; activateProbe(context); throw new Error("activation failed"); })).toThrow("activation failed");
    expect(() => held.registerShape(new ProbeProvider())).toThrow("expired"); expect(registry.contributions()).toEqual(before);
    expect(() => registry.register(activateProbe, () => { throw new Error("manifest check substitute failed"); })).toThrow("manifest check substitute failed");
    expect(registry.contributions()).toEqual(before); registry.register(activateProbe);
    expect(registry.contributions().commands).toEqual(["old", "inspect-probe", "tweak-probe"]);
  });
  it("poisons the batch even if activation catches a malformed registration", () => {
    const registry = new ExtensionRegistry();
    expect(() => registry.register(context => {
      try { context.registerCommand({ name: "broken" } as never); } catch {}
      context.registerCommand(new ProbeQueryCommand());
    })).toThrow("invalid command syntax"); expect(registry.contributions().commands).toEqual([]);
  });
  it("rejects reentrant activation without leaking its batch", () => {
    const registry = new ExtensionRegistry();
    expect(() => registry.register(context => { context.registerCommand(new ProbeQueryCommand()); registry.register(() => {}); }))
      .toThrow("registration already in progress"); expect(registry.contributions().commands).toEqual([]);
  });
  it("captures immutable identity metadata while retaining instance method binding", () => {
    const registry = new ExtensionRegistry(); const selector = { ...baseSelector }; const provider = new ProbeProvider("probe-leaf", selector);
    registry.register(context => context.registerShape(provider)); selector.localName = "changed";
    expect(registry.shapeForSvg(baseSelector)?.svg.localName).toBe("probe");
    expect(Object.isFrozen(registry.shape("probe-leaf"))).toBe(true); expect(Object.isFrozen(registry.shape("probe-leaf")!.svg)).toBe(true);
    expect(registry.shape("probe-leaf")!.present({ id: "p", kind: "probe-leaf", container: false, type: "ProbeLeaf", parentId: null, attributes: { value: 3 }, children: [] }).summary).toBe("value=3");
  });
  it.each(["", "bad name", "bad\nname"])("rejects invalid registration name %j", name => {
    const registry = new ExtensionRegistry(); expect(() => registry.register(context => context.registerCommand(new ProbeQueryCommand(name)))).toThrow("invalid registration name");
    expect(registry.contributions().commands).toEqual([]);
  });
  it.each([{ ...baseSelector, localName: "prefix:probe" }, { ...baseSelector, dataKind: "" }])("rejects invalid registered selector %#", svg => {
    const registry = new ExtensionRegistry(); expect(() => registry.register(context => context.registerShape(new ProbeProvider("probe-leaf", svg)))).toThrow();
    expect(registry.contributions().shapes).toEqual([]);
  });
  it("rejects a provider constructing the wrong kind", () => {
    const registry = new ExtensionRegistry(); registry.register(context => context.registerShape(new ProbeProvider("wrong")));
    expect(() => registry.shapeServices().create("wrong", "p", { value: 1 })).toThrow("provider returned wrong shape identity");
  });
  it("runs query command plans with or without a document without entering history", async () => {
    const registry = new ExtensionRegistry(); registry.register(activateProbe); const history = historyFixture();
    history.executeAction({ execute(port) { port.move("p", 1, 0); return { operation: "move", targetIds: ["p"], parameters: { dx: 1 } }; } });
    history.undo(); const before = state(history);
    const invocation = registry.command("inspect-probe")!.parse([], registry.shapeServices());
    expect(invocation.mode).toBe("query"); if (invocation.mode !== "query") throw new Error("wrong plan mode");
    expect(await invocation.execute({ document: null, rendering })).toEqual({ stdout: ["none"], stderr: [] });
    expect(await invocation.execute({ document: query(history), rendering })).toEqual({ stdout: ["1"], stderr: [] });
    expect(state(history)).toEqual(before);
    expect(() => registry.command("inspect-probe")!.parse(tokens("extra"), registry.shapeServices())).toThrow("usage:");
  });
  it("runs an edit plan in one existing History unit and copies its parsed token values", () => {
    const registry = new ExtensionRegistry(); registry.register(activateProbe); const history = historyFixture(); const before = state(history);
    const args = tokens("p", "8"); const invocation = registry.command("tweak-probe")!.parse(args, registry.shapeServices());
    args[0] = { value: "missing", quoted: false, column: 1 };
    expect(invocation.mode).toBe("edit"); if (invocation.mode !== "edit") throw new Error("wrong plan mode");
    history.executeAction({ execute: document => invocation.execute({ document, shapes: registry.shapeServices(), rendering }) });
    expect(query(history).find("p")!.attributes.value).toBe(8); history.undo();
    expect(query(history).view()).toEqual(before.view); expect(history.canUndo).toBe(false); history.redo();
    expect(query(history).find("p")!.attributes.value).toBe(8);
    const view = query(history).view();
    expect(registry.command("tweak-probe")!.describeOperation!({ direction: "redo", before: before.view, after: view,
      result: { operation: "set", targetIds: ["p"], parameters: { name: "value", value: 8 } } })).toEqual(["tweak redo"]);
  });
  it("composes tree tags in stable registration order across batches and includes root/saved context", () => {
    const registry = new ExtensionRegistry(); const doc = historyFixture().getDocumentSnapshot().view();
    expect(registry.treeTags({ document: doc, saved: null, node: null })).toEqual([]);
    registry.register(context => context.registerDecorator(new ProbeDecorator("first", "A")));
    registry.register(context => context.registerDecorator(new ProbeDecorator("second", "B")));
    expect(registry.contributions().decorators).toEqual(["first", "second"]);
    const tags = registry.treeTags({ document: doc, saved: doc, node: doc.roots[0]! });
    expect(tags).toEqual(["A", "B"]); expect(Object.isFrozen(tags)).toBe(true);
    registry.register(context => context.registerDecorator({ name: "observation", tags(context) {
      expect(context.node).toBeNull(); expect(context.saved).toBe(doc); expect(Object.isFrozen(context)).toBe(true); return ["", "C"];
    } }));
    expect(registry.treeTags({ document: doc, saved: doc, node: null })).toEqual(["A", "B", "C"]);
  });
  it("does not give decorators mutable model references", () => {
    const registry = new ExtensionRegistry(); const history = historyFixture(); const before = state(history);
    registry.register(context => context.registerDecorator({ name: "invalid-write", tags(context) {
      (context.node!.attributes as Record<string, number>).value = 9; return [];
    } }));
    expect(() => registry.treeTags({ document: before.view, saved: null, node: before.view.roots[0]! })).toThrow();
    expect(state(history)).toEqual(before);
  });
  it.each([["bad\nlabel"], [3], undefined])("rejects invalid tree tags %#", tags => {
    const registry = new ExtensionRegistry(); registry.register(context => context.registerDecorator({ name: "bad", tags: () => tags } as TreeDecorator));
    expect(() => registry.treeTags({ document: new SvgDocument().view(), saved: null, node: null })).toThrow("invalid tree tags");
  });
  it("matches through a read-only snapshot and applies several setters as one undo unit", () => {
    const registry = new ExtensionRegistry(); registry.register(activateProbe); const history = historyFixture();
    const before = state(history); const request = { targetId: "p", name: "pair", value: 4 };
    const action = registry.attributeAction(request); request.value = 99;
    const result = history.executeAttributes(action);
    expect(query(history).find("p")!.attributes).toEqual({ value: 4, "stroke-width": 4 });
    expect(result.feedbackOwner).toEqual({ category: "attributes", name: "probe-pair" });
    history.undo(); expect(query(history).view()).toEqual(before.view); expect(history.canUndo).toBe(false); history.redo();
    expect(query(history).find("p")!.attributes.value).toBe(4);
  });
  it("uses default setters only for zero matches, preserving existing unknown-attribute errors", () => {
    const registry = new ExtensionRegistry(); registry.register(activateProbe); const history = historyFixture();
    const result = history.executeAttributes(registry.attributeAction({ targetId: "p", name: "fill", value: "red" }));
    expect(result.feedbackOwner).toBeUndefined(); expect(query(history).find("p")!.attributes.fill).toBe("red");
    const before = state(history);
    expect(() => history.executeAttributes(registry.attributeAction({ targetId: "p", name: "not-defined", value: "x" }))).toThrow("unknown attribute: not-defined");
    expect(state(history)).toEqual(before);
    expect(() => registry.selectAttribute(query(history), "missing", "pair")).toThrow("no such shape: missing");
  });
  it("rejects every multi-match before apply, without choosing priority or affecting history", () => {
    const registry = new ExtensionRegistry(); let applied = 0; registry.register(context => {
      for (const name of ["first", "second"]) {
        const handler = new ProbeAttribute(name); handler.apply = () => { applied++; }; context.registerAttribute(handler);
      }
    });
    const history = historyFixture(); const before = state(history);
    expect(() => history.executeAttributes(registry.attributeAction({ targetId: "p", name: "pair", value: 2 })))
      .toThrow("attribute handler conflict: p/pair");
    expect(applied).toBe(0); expect(state(history)).toEqual(before);
  });
  it("rolls back a partial handler failure without default fallback or clearing redo", () => {
    const registry = new ExtensionRegistry(); registry.register(context => context.registerAttribute(new ProbeAttribute("failing", true)));
    const history = historyFixture(); history.executeAction({ execute(port) { port.move("p", 1, 0); return { operation: "move", targetIds: ["p"], parameters: {} }; } });
    history.undo(); const before = state(history);
    expect(() => history.executeAttributes(registry.attributeAction({ targetId: "p", name: "pair", value: 10 }))).toThrow("probe apply failed");
    expect(state(history)).toEqual(before); history.redo(); expect(query(history).find("p")!.attributes.value).toBe(2);
  });
  it("rejects mutation during pure matching and leaves state untouched", () => {
    const registry = new ExtensionRegistry(); const handler = new ProbeAttribute();
    handler.handles = context => { (context.target.attributes as Record<string, number>).value = 100; return true; };
    registry.register(context => context.registerAttribute(handler)); const history = historyFixture(); const before = state(history);
    expect(() => history.executeAttributes(registry.attributeAction({ targetId: "p", name: "pair", value: 3 }))).toThrow();
    expect(state(history)).toEqual(before);
  });
  it("cooperates with R3 prepare via pure owner metadata, without storing the handler in history", () => {
    const registry = new ExtensionRegistry(); registry.register(activateProbe); const doc = new SvgDocument(); doc.addShape(new ProbeLeaf("p"));
    const history = new CommandHistory({ prepare(context) {
      const owner = context.result.feedbackOwner;
      return { feedback: owner?.category === "attributes" ? registry.attribute(owner.name)!.describeOperation!(context)! : [] };
    } });
    history.replaceDocumentWithBarrier(doc);
    const result = history.executeAttributes(registry.attributeAction({ targetId: "p", name: "pair", value: 6 }));
    expect(result.preparedFeedback).toEqual(["pair execute"]);
    expect(history.undo().feedback).toEqual(["pair undo"]); expect(history.redo().feedback).toEqual(["pair redo"]);
  });
  it("rejects asynchronous activation and expires its retained registration context", async () => {
    const registry = new ExtensionRegistry(); let held!: RegistrationContext;
    expect(() => registry.register(async context => { held = context; activateProbe(context); await Promise.resolve(); context.registerCommand(new ProbeQueryCommand("late")); }))
      .toThrow("activation must be synchronous and return void");
    await Promise.resolve(); await Promise.resolve();
    expect(registry.contributions().shapes).toEqual([]); expect(() => held.registerShape(new ProbeProvider())).toThrow("expired");
  });
  it("rejects asynchronous contribution validation atomically", async () => {
    const registry = new ExtensionRegistry();
    expect(() => registry.register(activateProbe, async () => { throw new Error("delayed failure"); })).toThrow("registration validation must be synchronous and return void");
    await Promise.resolve(); await Promise.resolve(); expect(registry.contributions().commands).toEqual([]);
  });
  it("rejects asynchronous attribute matching/apply without delayed edits", async () => {
    const registry = new ExtensionRegistry(); const match = new ProbeAttribute();
    match.handles = (() => Promise.reject(new Error("delayed match"))) as never;
    registry.register(context => context.registerAttribute(match)); const history = historyFixture(); const before = state(history);
    expect(() => history.executeAttributes(registry.attributeAction({ targetId: "p", name: "pair", value: 2 }))).toThrow("attribute match must return a synchronous boolean");
    const other = new ExtensionRegistry(); const apply = new ProbeAttribute();
    apply.apply = async (context, request) => { context.setDefault(request.targetId, "value", 9); await Promise.resolve(); context.setDefault(request.targetId, "value", 10); };
    other.register(context => context.registerAttribute(apply));
    expect(() => history.executeAttributes(other.attributeAction({ targetId: "p", name: "pair", value: 2 }))).toThrow("attribute apply must be synchronous and return void");
    await Promise.resolve(); await Promise.resolve(); expect(state(history)).toEqual(before);
  });
  it("rejects async decorators without an unhandled rejection", async () => {
    const registry = new ExtensionRegistry();
    registry.register(context => context.registerDecorator({ name: "async", tags: () => Promise.reject(new Error("delayed tags")) } as never));
    expect(() => registry.treeTags({ document: new SvgDocument().view(), saved: null, node: null })).toThrow("invalid tree tags");
    await Promise.resolve(); await Promise.resolve();
  });
  it("keeps independent registry instances isolated", () => {
    const first = new ExtensionRegistry(), second = new ExtensionRegistry();
    first.register(activateProbe);
    expect(second.contributions()).toEqual({ shapes: [], commands: [], decorators: [], attributes: [] });
    second.register(context => context.registerDecorator(new ProbeDecorator("probe-tag", "different")));
    const observation = { document: new SvgDocument().view(), saved: null, node: null };
    expect(first.treeTags(observation)).toEqual(["(probe)"]);
    expect(second.treeTags(observation)).toEqual(["different"]);
  });

});
