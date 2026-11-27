import type { FeedbackOwner } from "./Feedback";
export type CommandOperation =
  | "create" | "delete" | "move" | "scale" | "set"
  | "group" | "ungroup" | "addto" | "front" | "back";

export type CommandParameter = string | number | readonly string[];

/**
 * Plain values only. History copies and freezes results before committing.
 * Operation names are a closed union; parameters remain a general dictionary,
 * not a per-operation discriminated parameter schema.
 */
export interface CommandResult {
  readonly operation: CommandOperation;
  readonly feedbackOwner?: FeedbackOwner;
  /** Prepared by the trusted application, never taken from a raw command result. */
  readonly preparedFeedback?: readonly string[];
  readonly targetIds: readonly string[];
  readonly parameters: Readonly<Record<string, CommandParameter>>;
}
