import { describe, expect, it, vi } from "vitest";
import { ContainerShape } from "../../src/api";
import { Group } from "../../plugins/builtin-shapes/Group";
import { SvgDocument } from "../support/defaults";
import { ProbeLeaf, composite, RequiredPartsContainer } from "../support/ContractShapes";

describe("generic container and clone contract", () => {
  it("transforms nested non-Group containers through descendant geometry", () => {
    const outer = composite("outer"); const inner = composite("inner"); outer.addChild(inner);
    expect(outer).not.toBeInstanceOf(Group); expect(outer).toBeInstanceOf(ContainerShape);
    outer.move(2, 3); outer.scale(2);
    expect(outer.children[0]!.attributes().value).toBe(12);
    expect(inner.children[0]!.attributes().value).toBe(12);
    const copy = outer.clone(); expect(copy).toBeInstanceOf(RequiredPartsContainer);
    expect(copy.children[1]).toBeInstanceOf(RequiredPartsContainer);
    copy.move(1, 0); expect(outer.children[0]!.attributes().value).toBe(12);
  });
  it("preserves local shared-leaf cumulative preflight without allowing document multiple parents", () => {
    const left = new Group("left"), right = new Group("right"), root = new Group("root");
    const leaf = new ProbeLeaf("p"); left.addChild(leaf); right.addChild(leaf); root.addChild(left); root.addChild(right);
    root.move(1, 0); expect(leaf.attributes().value).toBe(3);
    expect(() => new SvgDocument().addShape(root)).toThrow("multiple parents");
  });
  it("collects IDs from all generic descendant containers before insertion", () => {
    const doc = new SvgDocument(); doc.addShape(new ProbeLeaf("compound-part"));
    expect(() => doc.addShape(composite())).toThrow("id already exists: compound-part");
    expect(doc.view().roots.map(node => node.id)).toEqual(["compound-part"]);
  });
  it("rejects illegal positions, noncontainers and cycles", () => {
    const doc = new SvgDocument(); doc.addShape(new ProbeLeaf("p"));
    expect(() => doc.addShape(composite(), undefined, -1)).toThrow("invalid child index");
    expect(() => doc.addShape(composite(), "p")).toThrow("not a container: p");
    const a = composite("a"), b = composite("b"); a.addChild(b);
    expect(() => b.addChild(a)).toThrow("circular containment");
    doc.addShape(a); expect(() => doc.addTo("b", "a")).toThrow("cannot move a shape into itself or its descendant");
  });
  it("rejects forged cycles before invoking clone", () => {
    const node = composite(); const clone = vi.spyOn(node, "clone");
    vi.spyOn(node, "children", "get").mockReturnValue([node]);
    expect(() => new SvgDocument().addShape(node)).toThrow("circular containment"); expect(clone).not.toHaveBeenCalled();
  });
  it.each(["kind", "attributes", "children", "type", "shared"])("rejects clone losing %s", mode => {
    const node = composite();
    const original = node.clone.bind(node);
    vi.spyOn(node, "clone").mockImplementation(() => {
      if (mode === "shared") return node;
      if (mode === "type") return new Group(node.id) as unknown as RequiredPartsContainer;
      const copy = original();
      if (mode === "kind") Object.defineProperty(copy, "kind", { value: "other" });
      if (mode === "attributes") copy.setAttribute("fill", "red");
      if (mode === "children") copy.removeChild(copy.children[0]!);
      return copy;
    });
    expect(() => new SvgDocument().addShape(node)).toThrow(/clone/);
  });
  it("rejects a clone sharing private mutable metadata", () => {
    class Shallow extends ProbeLeaf {
      private readonly metadata = { values: [1] };
      override clone(): Shallow { const copy = new Shallow(this.id); Object.assign(copy, { metadata: this.metadata }); return copy; }
    }
    expect(() => new SvgDocument().addShape(new Shallow("p"))).toThrow("clone shares mutable state");
  });
  it("rejects a clone that loses its class even when kind and content match", () => {
    class Derived extends ProbeLeaf {}
    expect(() => new SvgDocument().addShape(new Derived("p"))).toThrow("clone must preserve shape type");
  });
  it("keeps ordinary nested group expansion and generic composite rejection distinct", () => {
    const doc = new SvgDocument(); doc.addShape(new Group("scene")); doc.addShape(new Group("g"), "scene");
    doc.addShape(new ProbeLeaf("p"), "g"); doc.ungroup("g"); expect(doc.getParentId("p")).toBe("scene");
    doc.addShape(composite()); expect(() => doc.ungroup("compound")).toThrow("cannot ungroup composite shape: compound");
    expect(() => doc.ungroup("scene")).toThrow("cannot ungroup top-level container: scene");
  });
});

it("rejects a clone returning the same already-frozen node", () => {
  const node = new ProbeLeaf("p");
  node.clone = () => node; Object.freeze(node);
  expect(() => new SvgDocument().addShape(node)).toThrow("clone shares mutable state");
});

it("expands a non-Group ordinary container in place", () => {
  class OpenContainer extends ContainerShape {
    readonly kind = "open-container";
    readonly ungroupPolicy = "expand" as const;
    override clone(): OpenContainer {
      const copy = new OpenContainer(this.id, this.copyStyle());
      for (const child of this.children) copy.addChild(child.clone()); return copy;
    }
  }
  const parent = new OpenContainer("parent"), inner = new OpenContainer("inner");
  inner.addChild(new ProbeLeaf("p")); parent.addChild(inner);
  const doc = new SvgDocument(); doc.addShape(parent); doc.ungroup("inner");
  expect(doc.getParentId("p")).toBe("parent"); expect(doc.getShapeSnapshot("parent")).toBeInstanceOf(OpenContainer);
});

it("checks duplicate IDs and multiple parents within non-Group subtrees", () => {
  const duplicate = composite(); duplicate.addChild(new ProbeLeaf("compound-part"));
  expect(() => new SvgDocument().addShape(duplicate)).toThrow("id already exists: compound-part");
  const parent = composite("parent"), left = composite("left"), right = composite("right"), shared = new ProbeLeaf("shared");
  left.addChild(shared); right.addChild(shared); parent.addChild(left); parent.addChild(right);
  expect(() => new SvgDocument().addShape(parent)).toThrow("shape has multiple parents: shared");
});

it("isolates correctly cloned nested mutable plugin state and preserves source behavior", () => {
  class StatefulLeaf extends ProbeLeaf {
    private readonly state: { samples: number[] };
    constructor(id: string, samples: readonly number[] = [1]) {
      super(id, samples.reduce((sum, value) => sum + value, 0));
      this.state = { samples: [...samples] };
    }
    append(value: number): void {
      this.state.samples.push(value);
      this.setAttribute("value", this.state.samples.reduce((sum, item) => sum + item, 0));
    }
    override clone(): StatefulLeaf {
      const copy = new StatefulLeaf(this.id, this.state.samples);
      for (const [name, value] of Object.entries(this.attributes())) copy.setAttribute(name, value);
      return copy;
    }
  }
  const source = new StatefulLeaf("p"); source.setAttribute("fill", "red");
  const before = source.attributes(); const copy = source.clone();
  expect(source.attributes()).toEqual(before);
  expect(copy.attributes()).toEqual(before); expect(copy).toBeInstanceOf(StatefulLeaf);
  const doc = new SvgDocument(); doc.addShape(source);
  const documentCopy = doc.clone(); const snapshot = doc.getShapeSnapshot("p") as StatefulLeaf;
  source.append(2); copy.append(3); snapshot.append(4);
  documentCopy.setAttribute("p", "value", 9);
  expect([source.attributes().value, copy.attributes().value, snapshot.attributes().value]).toEqual([3, 4, 5]);
  expect(doc.getShapeSnapshot("p").attributes()).toEqual(before);
  expect(documentCopy.getShapeSnapshot("p").attributes().value).toBe(9);
});
