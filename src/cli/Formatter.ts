import type { DocumentView, ShapeView } from "../api";
import type { ShapeDetails } from "../services/EditorTypes";
import type { ExtensionRegistry } from "../extensions/ExtensionRegistry";

type Observation = { readonly document: DocumentView; readonly saved: DocumentView | null };

/** Layout only. Semantic labels, geometry and styles belong to shape providers. */
export class Formatter {
  constructor(private readonly registry: ExtensionRegistry, private readonly observe?: () => Observation,
    private readonly detachedParentTag = "container") {}

  private view(shape: ShapeDetails | ShapeView): ShapeView {
    return "children" in shape ? shape : Object.freeze({
      ...shape, kind: shape.kind, container: shape.container, children: Object.freeze([]),
    });
  }

  label(shape: ShapeDetails | ShapeView): string {
    return `${this.registry.shapeServices().present(this.view(shape)).tag}#${this.singleLine(shape.id)}`;
  }

  parent(shape: ShapeDetails): string {
    if (shape.parentId === null) return "svg";
    const parent = this.find(this.observe?.().document, shape.parentId);
    return parent ? this.label(parent) : `${this.detachedParentTag}#${this.singleLine(shape.parentId)}`;
  }

  value(value: string | number | undefined): string {
    return typeof value === "string" ? JSON.stringify(value) : String(value);
  }

  position(shape: ShapeDetails | ShapeView): string | null {
    return this.registry.shapeServices().present(this.view(shape)).position;
  }

  tree(view: DocumentView | ShapeView, observation = this.observe?.()): string[] {
    const document = observation?.document ?? ("roots" in view ? view : Object.freeze({
      width: 0, height: 0, roots: Object.freeze([view]),
    }));
    const tags = (node: ShapeView | null): string => this.registry.treeTags({
      document, saved: observation?.saved ?? null, node,
    }).map(tag => ` ${tag}`).join("");
    const lines: string[] = [];
    const descend = (nodes: readonly ShapeView[], prefix: string): void => {
      nodes.forEach((node, index) => {
        const last = index === nodes.length - 1;
        lines.push(`${prefix}${last ? "└── " : "├── "}${this.summary(node)}${tags(node)}`);
        descend(node.children, prefix + (last ? "    " : "│   "));
      });
    };
    if ("roots" in view) {
      lines.push(`svg (${view.width}x${view.height})${tags(null)}`);
      descend(view.roots, "");
    } else {
      lines.push(this.summary(view) + tags(view));
      descend(view.children, "");
    }
    return lines;
  }

  show(shape: ShapeDetails | ShapeView): string[] {
    const presentation = this.registry.shapeServices().present(this.view(shape));
    const lines = [`${this.label(shape)}  parent=${this.parent(shape)}`];
    const geometry = presentation.geometry.map(([key, value]) => `${key}=${this.value(value)}`).join(" ");
    if (geometry) lines.push(`  ${geometry}`);
    const styles = presentation.styles.map(([key, value]) => `${key}=${value}`).join(" ");
    if (styles) lines.push(`  ${styles}`);
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
    return visit(view?.roots ?? []);
  }

  error(error: unknown): string {
    return `error: ${this.singleLine(error instanceof Error ? error.message : String(error))}`;
  }

  singleLine(text: string): string { return text.replace(/\r/g, "\\r").replace(/\n/g, "\\n"); }

  private summary(shape: ShapeView): string {
    const presentation = this.registry.shapeServices().present(shape);
    return [this.label(shape), presentation.summary,
      presentation.styles.map(([key, value]) => `${key}=${value}`).join(" ")].filter(Boolean).join("  ");
  }
}
