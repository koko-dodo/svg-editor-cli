import { SvgFileStore } from "../io/SvgFileStore";
import type { FileResult } from "./EditorTypes";
import { SvgDocument } from "../model/SvgDocument";
import { ShapeFactory } from "../model/ShapeFactory";
import { CommandHistory } from "../commands/CommandHistory";
import { DocumentViewBuilder } from "../commands/DocumentViewBuilder";
import { CreateCommand } from "../commands/CreateCommand";
import { DeleteCommand } from "../commands/DeleteCommand";
import { MoveCommand } from "../commands/MoveCommand";
import { ScaleCommand } from "../commands/ScaleCommand";
import { SetAttributeCommand } from "../commands/SetAttributeCommand";
import { GroupCommand } from "../commands/GroupCommand";
import { UngroupCommand } from "../commands/UngroupCommand";
import { AddToCommand } from "../commands/AddToCommand";
import { FrontCommand } from "../commands/FrontCommand";
import { BackCommand } from "../commands/BackCommand";
import type {
  CanvasSize, CommandResult, CreateRequest, DocumentView, EditorStatus,
  HistoryResult, ShapeDetails, ShapeView,
} from "./EditorTypes";

/** Application facade. History is the sole owner of the current document version. */
export class Editor {
  private readonly history = new CommandHistory();
  private readonly factory = new ShapeFactory();

  private busy = false;
  private readPath: string | undefined;
  constructor(private readonly files: Pick<SvgFileStore, "read" | "save"> = new SvgFileStore()) {}

  async read(path: string): Promise<FileResult> {
    this.assertIdle();
    this.busy = true;
    try {
      const loaded = await this.files.read(path);
      const result = Object.freeze({ path: loaded.path, elements: loaded.elements, warnings: Object.freeze([...loaded.warnings]) });
      this.history.replaceDocumentWithBarrier(loaded.document);
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
      const saved = await this.files.save(target, document);
      const result = Object.freeze({ ...saved, warnings: Object.freeze([]) });
      this.history.markBarrier();
      return result;
    } finally { this.busy = false; }
  }

  private assertIdle(): void {
    if (this.busy) throw new Error("editor is busy with file IO");
  }

  init(width = 800, height = 600): CanvasSize {
    this.assertIdle();
    const document = new SvgDocument(width, height);
    const result = Object.freeze({ width: document.width, height: document.height });
    this.history.replaceDocumentWithBarrier(document);
    this.readPath = undefined;
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

  create(request: CreateRequest): CommandResult {
    this.assertIdle();
    // Check the application precondition before constructing the new template.
    if (!this.history.hasDocument) throw new Error("no document. use 'init' or 'read' first");
    return this.history.execute(new CreateCommand(this.factory.create(request), request.parentId));
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
    return this.history.execute(new SetAttributeCommand(id, name, value));
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
    const { id: shapeId, type, parentId, attributes } = this.tree(id);
    return Object.freeze({ id: shapeId, type, parentId, attributes });
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
