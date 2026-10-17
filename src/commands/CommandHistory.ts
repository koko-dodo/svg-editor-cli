import type { SvgDocument } from "../model/SvgDocument";
import type { Command } from "./Command";
import type { CommandParameter, CommandResult } from "./CommandResult";
import { DocumentViewBuilder } from "./DocumentViewBuilder";
import type { DocumentView } from "./DocumentViewBuilder";

export interface HistoryResult {
  readonly direction: "undo" | "redo";
  readonly command: CommandResult;
  /** Complete restored values, including geometry, styles, parents and order. */
  readonly restored: DocumentView;
}

interface Entry {
  readonly before: SvgDocument;
  readonly after: SvgDocument;
  readonly result: CommandResult;
}

interface HistoryState {
  readonly current: SvgDocument | null;
  readonly undo: readonly Entry[];
  readonly redo: readonly Entry[];
  readonly blocked: boolean;
}

export class CommandHistory {
  // Committed documents are private and never mutated, so adjacent entries may
  // safely share a version. Only clones leave this object or reach commands.
  private state: HistoryState = { current: null, undo: [], redo: [], blocked: false };
  private busy = false;

  get hasDocument(): boolean { return this.state.current !== null; }
  get isBlocked(): boolean { return this.state.blocked; }
  get canUndo(): boolean { return !this.state.blocked && this.state.undo.length > 0; }
  get canRedo(): boolean { return !this.state.blocked && this.state.redo.length > 0; }

  getDocumentSnapshot(): SvgDocument {
    return this.requireDocument().clone();
  }

  execute(command: Command): CommandResult {
    return this.mutate(() => {
      const before = this.requireDocument();
      const work = before.clone();
      const rawResult = command.execute(work);
      const after = work.clone();
      const result = this.copyResult(rawResult);
      const entry: Entry = { before, after, result };
      const next: HistoryState = {
        current: after,
        undo: [...this.state.undo, entry],
        redo: [],
        blocked: false,
      };
      this.state = next;
      return result;
    });
  }

  undo(): HistoryResult { return this.restore("undo"); }
  redo(): HistoryResult { return this.restore("redo"); }

  /** Call only after init/read/canvas preparation has succeeded. */
  replaceDocumentWithBarrier(document: SvgDocument): void {
    this.mutate(() => {
      const current = document.clone();
      this.state = { current, undo: [], redo: [], blocked: true };
    });
  }

  /** Call only after a document operation (notably save) has succeeded. */
  markBarrier(): void {
    this.mutate(() => {
      const current = this.requireDocument();
      this.state = { current, undo: [], redo: [], blocked: true };
    });
  }

  private restore(direction: "undo" | "redo"): HistoryResult {
    return this.mutate(() => {
      this.requireDocument();
      if (this.state.blocked) throw new Error("undo not allowed after io command");
      const source = this.state[direction];
      const entry = source[source.length - 1];
      if (entry === undefined) throw new Error(`nothing to ${direction}`);
      const current = direction === "undo" ? entry.before : entry.after;
      // Building the returned view can fail too; do it before moving any entry.
      const result: HistoryResult = Object.freeze({
        direction,
        command: entry.result,
        restored: DocumentViewBuilder.capture(current),
      });
      const next: HistoryState = direction === "undo"
        ? { current, undo: source.slice(0, -1), redo: [...this.state.redo, entry], blocked: false }
        : { current, undo: [...this.state.undo, entry], redo: source.slice(0, -1), blocked: false };
      this.state = next;
      return result;
    });
  }

  private requireDocument(): SvgDocument {
    if (this.state.current === null) throw new Error("no document. use 'init' or 'read' first");
    return this.state.current;
  }

  private copyResult(result: CommandResult): CommandResult {
    // Copy only plain protocol values, never arbitrary class instances or refs.
    const operation = result.operation;
    const operations: readonly string[] = ["create", "delete", "move", "scale", "set", "group", "ungroup", "addto", "front", "back"];
    if (typeof operation !== "string" || !operations.includes(operation)) throw new Error("invalid command result operation");
    const parameters: Record<string, CommandParameter> = {};
    for (const [key, value] of Object.entries(result.parameters)) {
      if (typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) {
        Object.defineProperty(parameters, key, { value, enumerable: true });
      } else if (Array.isArray(value) && value.every(item => typeof item === "string")) {
        Object.defineProperty(parameters, key, { value: Object.freeze([...value]), enumerable: true });
      } else {
        throw new Error("invalid command result parameter");
      }
    }
    const targetIds = result.targetIds;
    if (!Array.isArray(targetIds) || !targetIds.every(id => typeof id === "string")) throw new Error("invalid command result targets");
    return Object.freeze({
      operation,
      targetIds: Object.freeze([...targetIds]),
      parameters: Object.freeze(parameters),
    });
  }

  /** Prevent a command from reentering history and creating a second commit. */
  private mutate<T>(action: () => T): T {
    if (this.busy) throw new Error("history operation already in progress");
    this.busy = true;
    try { return action(); }
    finally { this.busy = false; }
  }
}
