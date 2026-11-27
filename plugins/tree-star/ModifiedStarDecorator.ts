import type { DocumentView, ShapeView, TreeDecorationContext, TreeDecorator } from "../../src/api";

/** Stateless content comparison: history revisions and compatibility type names are irrelevant. */
export class ModifiedStarDecorator implements TreeDecorator {
  readonly name = "modified-star";

  tags({ document, saved, node }: TreeDecorationContext): readonly string[] {
    if (!saved) return ["*"];
    if (!node) return this.documentEquals(document, saved) ? [] : ["*"];
    const previous = this.find(saved.roots, node.id);
    return previous && this.nodeEquals(node, previous) ? [] : ["*"];
  }

  private find(nodes: readonly ShapeView[], id: string): ShapeView | undefined {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = this.find(node.children, id);
      if (found) return found;
    }
    return undefined;
  }

  private documentEquals(a: DocumentView, b: DocumentView): boolean {
    return a.width === b.width && a.height === b.height && this.childrenEqual(a.roots, b.roots);
  }

  private childrenEqual(a: readonly ShapeView[], b: readonly ShapeView[]): boolean {
    return a.length === b.length && a.every((node, i) => this.nodeEquals(node, b[i]!));
  }

  private nodeEquals(a: ShapeView, b: ShapeView): boolean {
    const keys = Object.keys(a.attributes);
    return a.id === b.id && a.kind === b.kind && a.container === b.container && a.parentId === b.parentId
      && keys.length === Object.keys(b.attributes).length
      && keys.every(key => Object.hasOwn(b.attributes, key) && a.attributes[key] === b.attributes[key])
      && this.childrenEqual(a.children, b.children);
  }
}
