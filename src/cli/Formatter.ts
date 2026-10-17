import type { DocumentView, ShapeDetails, ShapeView } from "../services/EditorTypes";
import { ShapeSyntax } from "./ShapeSyntax";

export class Formatter {
  constructor(private readonly shapes = new ShapeSyntax()) {}

  label(shape: ShapeDetails): string { return `${this.shapes.tag(shape.type)}#${this.singleLine(shape.id)}`; }
  parent(shape: ShapeDetails): string { return shape.parentId === null ? "svg" : `g#${this.singleLine(shape.parentId)}`; }
  value(value: string | number | undefined): string {
    return typeof value === "string" ? JSON.stringify(value) : String(value);
  }
  position(shape: ShapeDetails): string | null { return this.shapes.position(shape); }

  tree(view: DocumentView | ShapeView): string[] {
    const lines: string[] = [];
    const descend = (nodes: readonly ShapeView[], prefix: string): void => {
      nodes.forEach((node, index) => {
        const last = index === nodes.length - 1;
        lines.push(`${prefix}${last ? "└── " : "├── "}${this.summary(node)}`);
        descend(node.children, prefix + (last ? "    " : "│   "));
      });
    };
    if ("roots" in view) {
      lines.push(`svg (${view.width}x${view.height})`);
      descend(view.roots, "");
    } else {
      lines.push(this.summary(view));
      descend(view.children, "");
    }
    return lines;
  }

  show(shape: ShapeDetails): string[] {
    const lines = [`${this.label(shape)}  parent=${this.parent(shape)}`];
    const geometry = this.shapes.fields(shape.type).map(key => `${key}=${this.value(shape.attributes[key])}`).join(" ");
    if (geometry) lines.push(`  ${geometry}`);
    const style = this.styles(shape);
    if (style) lines.push(`  ${style}`);
    return lines;
  }

  find(view: DocumentView | undefined, id: string): ShapeView | undefined {
    const visit = (nodes: readonly ShapeView[]): ShapeView | undefined => {
      for (const node of nodes) {
        if (node.id === id) return node;
        const found = visit(node.children);
        if (found) return found;
      }
      return undefined;
    };
    return view === undefined ? undefined : visit(view.roots);
  }

  error(error: unknown): string {
    return `error: ${this.singleLine(error instanceof Error ? error.message : String(error))}`;
  }

  singleLine(text: string): string {
    return text.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
  }

  private summary(shape: ShapeDetails): string {
    return [this.label(shape), this.shapes.summary(shape), this.styles(shape)].filter(Boolean).join("  ");
  }
  private styles(shape: ShapeDetails): string {
    return ["fill", "stroke", "stroke-width"]
      .filter(key => shape.attributes[key] !== undefined)
      .map(key => `${key}=${this.singleLine(String(shape.attributes[key]))}`).join(" ");
  }
}
