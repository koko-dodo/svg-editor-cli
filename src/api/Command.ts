import type { CommandResult } from "./CommandResult";
import type { DocumentQuery, DocumentView, ShapeView } from "./Domain";
import type { MutationPort } from "./Editing";
import type { AttributeRequest } from "./AttributeHandler";
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
  readonly help?: () => readonly string[];
}
export interface EditCommandContext {
  readonly document: MutationPort;
  readonly shapes: ShapeServices;
  /** Resolve handlers inside this same scoped transaction. */
  setAttribute(request: AttributeRequest): CommandResult;
  readonly rendering: RenderingServices;
}
export interface HostFileResult { readonly path: string; readonly elements: number; readonly warnings: readonly { readonly tag: string; readonly id: string }[] }
export interface HostHistoryResult { readonly feedback: readonly string[] }
/** Individually granted operations; never a session/editor/history reference. */
export interface HostOperations {
  initialize(width: number, height: number): { readonly width: number; readonly height: number };
  canvas(): { readonly width: number; readonly height: number };
  resize(width: number, height: number): { readonly width: number; readonly height: number };
  read(path: string): Promise<HostFileResult>;
  save(path?: string): Promise<HostFileResult>;
  undo(): HostHistoryResult;
  redo(): HostHistoryResult;
}
export type HostInvocation = { [K in keyof HostOperations]: { readonly mode: "host"; readonly capability: K;
  execute(port: Pick<HostOperations, K>): ExtensionOutput | Promise<ExtensionOutput> } }[keyof HostOperations];
/** Plans are ephemeral. The host runs edit plans inside ONE existing History action. */
export type CommandInvocation = ({
  /** Optional pure-value parse observation. The catalog copies it; it is not execution authority. */
  readonly request?: Readonly<Record<string, unknown>>
} & (
  | { readonly mode: "query"; execute(context: QueryCommandContext): ExtensionOutput | Promise<ExtensionOutput> }
  | { readonly mode: "edit"; execute(context: EditCommandContext): CommandResult }
  | HostInvocation));

/** CLI extension point, distinct from internal commands/Command.execute(SvgDocument). */
export interface Command extends Partial<OperationFeedback> {
  readonly name: string;
  readonly syntax: string;
  /** Validate arguments and capture them in an execution plan; do not edit here. */
  parse(args: readonly CommandToken[], shapes: ShapeServices): CommandInvocation;
}
