import type { ShapeDefinition } from "../model/ShapeFactory";
import type { ShapeView } from "../commands/DocumentViewBuilder";

/** All six variants support placement without requiring callers to construct Shapes. */
export type CreateRequest = ShapeDefinition & { readonly parentId?: string };

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

/** TODO(CLI): type is a model class name, not an SVG tag; resolve display labels there. */
export type ShapeDetails = Omit<ShapeView, "children">;

// UI clients import public result types here, not from commands or model.
export type { CommandResult } from "../commands/CommandResult";
export type { HistoryResult } from "../commands/CommandHistory";
export type { DocumentView, ShapeView } from "../commands/DocumentViewBuilder";
