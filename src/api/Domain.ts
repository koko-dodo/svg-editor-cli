/** Values only: views never contain model instances or functions. */
export type AttributeValue = string | number;
export type Attributes = Readonly<Record<string, AttributeValue>>;

export interface ShapeView {
  readonly id: string;
  readonly kind: string;
  readonly container: boolean;
  /** Migration compatibility only. New plugins must dispatch on kind. */
  readonly type: string;
  readonly parentId: string | null;
  readonly attributes: Attributes;
  readonly children: readonly ShapeView[];
}
export interface DocumentView {
  readonly width: number;
  readonly height: number;
  readonly roots: readonly ShapeView[];
}
export interface DocumentQuery {
  view(): DocumentView;
  find(id: string): ShapeView | undefined;
  parentId(id: string): string | null;
}
