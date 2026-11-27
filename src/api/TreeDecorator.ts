import type { DocumentView, ShapeView } from "./Domain";

export interface TreeDecorationContext {
  readonly document: DocumentView;
  /** Last successful read/save baseline; null means no saved content yet. */
  readonly saved: DocumentView | null;
  /** Null selects the root SVG row. Views supplied by the host are deep-frozen. */
  readonly node: ShapeView | null;
}
export interface TreeDecorator {
  readonly name: string;
  /** Pure document observation. Per-session comparison caches may live in this instance. */
  tags(context: TreeDecorationContext): readonly string[];
}
