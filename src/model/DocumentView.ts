import type { Shape } from "./Shape";
import type { DocumentQuery, DocumentView, ShapeView } from "../api/Domain";
import { attributesOf } from "./ShapeTree";

export function captureView(width: number, height: number, roots: readonly Shape[]): DocumentView {
  return Object.freeze({
    width,
    height,
    roots: Object.freeze(roots.map(shape => shapeView(shape, null))),
  });
}

function shapeView(shape: Shape, parentId: string | null): ShapeView {
  const attributes = attributesOf(shape);
  return Object.freeze({
    id: shape.id,
    kind: shape.kind,
    container: shape.asContainer() !== null,
    type: shape.constructor.name,
    parentId,
    attributes: Object.freeze(attributes),
    children: Object.freeze(shape.asContainer()?.children.map(child => shapeView(child, shape.id)) ?? []),
  });
}

export function queryView(view: DocumentView): DocumentQuery {
  const find = (id: string): ShapeView | undefined => {
    const visit = (nodes: readonly ShapeView[]): ShapeView | undefined => {
      for (const node of nodes) {
        if (node.id === id) return node;
        const child = visit(node.children);
        if (child !== undefined) return child;
      }
      return undefined;
    };
    return visit(view.roots);
  };
  return Object.freeze({
    view: () => view,
    find,
    parentId: (id: string) => {
      const node = find(id);
      if (node === undefined) throw new Error(`no such shape: ${id}`);
      return node.parentId;
    },
  });
}
