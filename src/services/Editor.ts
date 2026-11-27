import type { EditingAction, AttributeAction } from "../api/Editing";
import type { CommitPreparer } from "../commands/CommandHistory";
import { FeedbackResolver } from "./FeedbackResolver";
import { queryView } from "../model/DocumentView";
import { attributePort } from "../commands/EditingContext";
import type { AttributeRequest, CommandInvocation, DocumentQuery, RenderingServices } from "../api";
import type { ContainerShape } from "../model/ContainerShape";
import type { SvgFileStore } from "../io/SvgFileStore";
import type { FileResult } from "./EditorTypes";
import { SvgDocument } from "../model/SvgDocument";
import type { ExtensionRegistry } from "../extensions/ExtensionRegistry";
import { CommandHistory } from "../commands/CommandHistory";
import { DocumentViewBuilder } from "../commands/DocumentViewBuilder";
import { CreateCommand } from "../commands/CreateCommand";
import { DeleteCommand } from "../commands/DeleteCommand";
import { MoveCommand } from "../commands/MoveCommand";
import { ScaleCommand } from "../commands/ScaleCommand";
import { GroupCommand } from "../commands/GroupCommand";
import { UngroupCommand } from "../commands/UngroupCommand";
import { AddToCommand } from "../commands/AddToCommand";
import { FrontCommand } from "../commands/FrontCommand";
import { BackCommand } from "../commands/BackCommand";
import type {
  CanvasSize, CommandResult, DocumentView, EditorStatus,
  HistoryResult, ShapeDetails, ShapeView,
} from "./EditorTypes";

/** Application facade. History is the sole owner of the current document version. */
export class Editor {
  private readonly history: CommandHistory;

  private busy = false;
  private saved: DocumentView | null = null;
  private readPath: string | undefined;
  constructor(readonly registry: ExtensionRegistry, private readonly files: Pick<SvgFileStore, "read" | "save">,
    preparer?: CommitPreparer, private readonly makeGroup?: (id: string) => ContainerShape) {
    this.history = new CommandHistory(preparer ?? new FeedbackResolver(registry));
  }

  /** Trusted application adapter; no application instance reaches an extension. */
  executeInvocation(name: string, plan: Extract<CommandInvocation, { mode: "edit" }>, rendering: RenderingServices): CommandResult {
    this.assertIdle();
    return this.history.executeAction({ execute: document => {
      const result = plan.execute(Object.freeze({ document, shapes: this.registry.shapeServices(), rendering,
        setAttribute: (request: AttributeRequest) => this.registry.attributeAction(request).execute(attributePort(document)),
      }));
      if (result !== null && typeof result === "object" && "then" in result) {
        void Promise.resolve(result).catch(() => {}); throw new Error("editing action must be synchronous");
      }
      return { ...result, commandName: name };
    } });
  }
  query(): DocumentQuery | null { return this.history.hasDocument ? queryView(this.tree()) : null; }
  observation(): { readonly document: DocumentView; readonly saved: DocumentView | null } {
    return Object.freeze({ document: this.tree(), saved: this.saved });
  }

  /** Trusted application entry: plugins receive only the scoped domain port. */
  executeAction(action: EditingAction): CommandResult {
    this.assertIdle();
    return this.history.executeAction(action);
  }

  executeAttributes(action: AttributeAction): CommandResult {
    this.assertIdle();
    return this.history.executeAttributes(action);
  }

  async read(path: string): Promise<FileResult> {
    this.assertIdle();
    this.busy = true;
    try {
      const loaded = await this.files.read(path);
      const result = Object.freeze({ path: loaded.path, elements: loaded.elements, warnings: Object.freeze([...loaded.warnings]) });
      const baseline = loaded.document.view();
      this.history.replaceDocumentWithBarrier(loaded.document);
      this.saved = baseline;
      this.readPath = loaded.absolutePath;
      return result;
    } finally { this.busy = false; }
  }

  async save(path?: string): Promise<FileResult> {
    this.assertIdle();
    this.busy = true;
    try {
      const document = this.history.getDocumentSnapshot();
      const target = path ?? this.readPath;
      if (target === undefined) throw new Error("no default save path. use 'save <file.svg>' or 'read' first");
      const baseline = document.view();
      const saved = await this.files.save(target, document);
      const result = Object.freeze({ ...saved, warnings: Object.freeze([]) });
      this.history.markBarrier();
      this.saved = baseline;
      return result;
    } finally { this.busy = false; }
  }

  private assertIdle(): void {
    if (this.busy) throw new Error("editor is busy with file IO");
  }

  init(width = 800, height = 600): CanvasSize {
    this.assertIdle();
    const document = new SvgDocument(width, height, this.makeGroup);
    const result = Object.freeze({ width: document.width, height: document.height });
    this.history.replaceDocumentWithBarrier(document);
    this.readPath = undefined;
    this.saved = null;
    return result;
  }

  getCanvas(): CanvasSize {
    const document = this.history.getDocumentSnapshot();
    return Object.freeze({ width: document.width, height: document.height });
  }

  resizeCanvas(width: number, height: number): CanvasSize {
    this.assertIdle();
    const document = this.history.getDocumentSnapshot();
    document.resize(width, height);
    const result = Object.freeze({ width: document.width, height: document.height });
    this.history.replaceDocumentWithBarrier(document);
    return result;
  }

  create<T extends { readonly type: string; readonly id: string; readonly parentId?: string }>(request: T): CommandResult {
    this.assertIdle();
    // Check the application precondition before constructing the new template.
    if (!this.history.hasDocument) throw new Error("no document. use 'init' or 'read' first");
    if (!this.registry.shape(request.type)) throw new Error(`unknown shape type: ${request.type} (is the plugin loaded?)`);
    const parameters: Record<string, string | number> = {};
    for (const [name, value] of Object.entries(request)) if (!["type", "id", "parentId"].includes(name) && (typeof value === "string" || typeof value === "number")) parameters[name] = value;
    return this.history.execute(new CreateCommand(this.registry.shapeServices().create(request.type, request.id, parameters), request.parentId));
  }

  delete(id: string): CommandResult {
    this.assertIdle();
    return this.history.execute(new DeleteCommand(id));
  }

  move(id: string, dx: number, dy: number): CommandResult {
    this.assertIdle();
    return this.history.execute(new MoveCommand(id, dx, dy));
  }

  scale(id: string, factor: number): CommandResult {
    this.assertIdle();
    return this.history.execute(new ScaleCommand(id, factor));
  }

  setAttribute(id: string, name: string, value: string | number): CommandResult {
    this.assertIdle();
    return this.history.executeAttributes(this.registry.attributeAction({ targetId: id, name, value }));
  }

  group(newId: string, ids: readonly string[]): CommandResult {
    this.assertIdle();
    return this.history.execute(new GroupCommand(newId, ids));
  }

  ungroup(id: string): CommandResult {
    this.assertIdle();
    return this.history.execute(new UngroupCommand(id));
  }

  addTo(groupId: string, id: string): CommandResult {
    this.assertIdle();
    return this.history.execute(new AddToCommand(groupId, id));
  }

  front(id: string): CommandResult {
    this.assertIdle();
    return this.history.execute(new FrontCommand(id));
  }

  back(id: string): CommandResult {
    this.assertIdle();
    return this.history.execute(new BackCommand(id));
  }

  undo(): HistoryResult { this.assertIdle(); return this.history.undo(); }
  redo(): HistoryResult { this.assertIdle(); return this.history.redo(); }

  tree(): DocumentView;
  tree(id: string): ShapeView;
  tree(id?: string): DocumentView | ShapeView;
  tree(id?: string): DocumentView | ShapeView {
    const view = DocumentViewBuilder.capture(this.history.getDocumentSnapshot());
    if (id === undefined) return view;
    const found = this.findView(view.roots, id);
    if (found === undefined) throw new Error(`no such shape: ${id}`);
    return found;
  }

  show(id: string): ShapeDetails {
    const { id: shapeId, type, parentId, attributes, kind, container } = this.tree(id);
    const details = { id: shapeId, type, parentId, attributes };
    Object.defineProperties(details, { kind: { value: kind }, container: { value: container } });
    return Object.freeze(details) as ShapeDetails;
  }

  getStatus(): EditorStatus {
    return Object.freeze({
      hasDocument: this.history.hasDocument,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      isBlocked: this.history.isBlocked,
    });
  }

  /** Search the immutable presentation tree, without accessing mutable model nodes. */
  private findView(nodes: readonly ShapeView[], id: string): ShapeView | undefined {
    for (const node of nodes) {
      if (node.id === id) return node;
      const nested = this.findView(node.children, id);
      if (nested !== undefined) return nested;
    }
    return undefined;
  }
}
