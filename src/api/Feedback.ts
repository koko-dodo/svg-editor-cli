import type { ShapeServices } from "./ShapeProvider";
import type { DocumentView } from "./Domain";
import type { CommandResult } from "./CommandResult";

export interface FeedbackOwner {
  readonly category: "shapes" | "attributes";
  readonly name: string;
}
export interface FeedbackContext {
  readonly shapes?: ShapeServices;
  readonly direction: "execute" | "undo" | "redo";
  readonly result: CommandResult;
  readonly before: DocumentView;
  readonly after: DocumentView;
}
export interface OperationFeedback {
  describeOperation(context: FeedbackContext): readonly string[] | undefined;
}
export interface CommitPreparation { readonly feedback: readonly string[]; }
