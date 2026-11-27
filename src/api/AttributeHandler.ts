import type { AttributeValue, DocumentQuery, ShapeView } from "./Domain";
import type { AttributeMutation } from "./Editing";
import type { OperationFeedback } from "./Feedback";

export interface AttributeRequest {
  readonly targetId: string;
  readonly name: string;
  readonly value: AttributeValue;
}
export interface AttributeMatchContext {
  readonly document: DocumentQuery;
  readonly target: ShapeView;
  readonly name: string;
}
export interface AttributeHandler extends Partial<OperationFeedback> {
  readonly name: string;
  /** Synchronous pure predicate; all matches are evaluated before any apply. */
  handles(context: AttributeMatchContext): boolean;
  /** Synchronous; multiple setters still belong to the enclosing single transaction. */
  apply(context: AttributeMutation, request: AttributeRequest): void;
}
