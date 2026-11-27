import type { CommandResult } from "./CommandResult";
import type { DocumentQuery, DocumentView, ShapeView } from "./Domain";
import type { MutationPort } from "./Editing";
import type { OperationFeedback } from "./Feedback";
import type { ShapeServices } from "./ShapeProvider";

/** Structurally compatible with existing tokenizer output; no CLI implementation dependency. */
export interface CommandToken {
  readonly value: string;
  readonly quoted: boolean;
  readonly column: number;
}
export interface ExtensionOutput {
  readonly stdout: readonly string[];
  readonly stderr: readonly string[];
}
export interface RenderingServices {
  tree(document: DocumentView, id?: string): readonly string[];
  show(node: ShapeView): readonly string[];
}
export interface QueryCommandContext {
  /** Null before init/read; a query command decides whether a document is required. */
  readonly document: DocumentQuery | null;
  readonly rendering: RenderingServices;
}
export interface EditCommandContext {
  readonly document: MutationPort;
  readonly shapes: ShapeServices;
  readonly rendering: RenderingServices;
}
/** Plans are ephemeral. The host runs edit plans inside ONE existing History action. */
export type CommandInvocation =
  | { readonly mode: "query"; execute(context: QueryCommandContext): ExtensionOutput | Promise<ExtensionOutput> }
  | { readonly mode: "edit"; execute(context: EditCommandContext): CommandResult };

/** CLI extension point, distinct from internal commands/Command.execute(SvgDocument). */
export interface Command extends Partial<OperationFeedback> {
  readonly name: string;
  readonly syntax: string;
  /** Validate arguments and capture them in an execution plan; do not edit here. */
  parse(args: readonly CommandToken[], shapes: ShapeServices): CommandInvocation;
}
