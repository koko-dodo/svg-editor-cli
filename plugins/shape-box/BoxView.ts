import type { DocumentView, ShapeView } from "../../src/api";
export function find(document: DocumentView, id: string): ShapeView | undefined {
  const visit = (nodes: readonly ShapeView[]): ShapeView | undefined => {
    for (const node of nodes) { if (node.id === id) return node; const nested = visit(node.children); if (nested) return nested; }
    return undefined;
  };
  return visit(document.roots);
}
export function part(node: ShapeView, suffix: "rect" | "label"): ShapeView {
  const child = node.children.find(child => child.id === `${node.id}-${suffix}`);
  if (!child) throw new Error(`invalid box parts: ${node.id}`);
  return child;
}
export function singleLine(value: string): string { return value.replace(/\r/g,"\\r").replace(/\n/g,"\\n"); }
