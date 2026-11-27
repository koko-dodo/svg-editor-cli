
import type { ShapeView } from "../commands/DocumentViewBuilder";

/** Legacy flat creation request; semantic providers own parameter validation. */
export interface CreateRequest { readonly type: string; readonly id: string; readonly parentId?: string; readonly [name: string]: string | number | undefined; }

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

export interface EditorStatus {
  readonly hasDocument: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly isBlocked: boolean;
}

/** Legacy show shape. Non-enumerable semantic metadata preserves the Phase 1 enumerable fields. */
export type ShapeDetails = Pick<ShapeView, "id" | "type" | "parentId" | "attributes" | "kind" | "container">;

// UI clients import public result types here, not from commands or model.
export type { CommandResult } from "../commands/CommandResult";
export type { HistoryResult } from "../commands/CommandHistory";
export type { DocumentView, ShapeView } from "../commands/DocumentViewBuilder";


export interface FileResult {
  readonly path: string;
  readonly elements: number;
  readonly warnings: readonly { readonly code: "assigned-id"; readonly tag: string; readonly id: string }[];
}
