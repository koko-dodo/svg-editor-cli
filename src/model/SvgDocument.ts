import { Group } from "./Group";
import { Shape } from "./Shape";

type Container = Group | null;
interface Location {
  readonly shape: Shape;
  readonly parent: Container;
  readonly index: number;
  /** Root sentinel followed by enclosing groups, ending with the direct parent. */
  readonly ancestors: readonly Container[];
}

/**
 * Owns an isolated, ordered tree. All inputs and returned shapes are copied.
 * The tree is the only ownership source; traversal metadata is operation-local.
 */
export class SvgDocument {
  private _width: number;
  private _height: number;
  private roots: Shape[] = [];

  constructor(width = 800, height = 600) {
    this.validateDimension(width, "width");
    this.validateDimension(height, "height");
    this._width = width;
    this._height = height;
  }

  get width(): number { return this._width; }
  get height(): number { return this._height; }

  resize(width: number, height: number): void {
    this.validateDimension(width, "width");
    this.validateDimension(height, "height");
    this._width = width;
    this._height = height;
  }

  hasShape(id: string): boolean {
    return this.locations().some(location => location.shape.id === id);
  }

  getShapeSnapshot(id: string): Shape {
    return this.requireLocation(id).shape.clone();
  }

  getRootSnapshots(): readonly Shape[] {
    return Object.freeze(this.roots.map(shape => shape.clone()));
  }

  getParentId(id: string): string | null {
    return this.requireLocation(id).parent?.id ?? null;
  }

  addShape(shape: Shape, parentId?: string, index?: number): void {
    const parent = parentId === undefined ? null : this.requireContainer(parentId);
    const position = index ?? this.childrenOf(parent).length;
    this.validateIndex(position, this.childrenOf(parent).length);
    // Validate BEFORE cloning: Group.clone() would unfold shared objects.
    const existingIds = new Set(this.locations().map(location => location.shape.id));
    this.validateForest([shape], existingIds);
    const copy = shape.clone();
    this.validateForest([copy], existingIds);
    this.insert(parent, copy, position);
  }

  deleteShape(id: string): void {
    this.detach(this.requireLocation(id));
  }

  move(id: string, dx: number, dy: number): void {
    this.requireLocation(id).shape.move(dx, dy);
  }

  scale(id: string, factor: number): void {
    this.requireLocation(id).shape.scale(factor);
  }

  setAttribute(id: string, name: string, value: string | number): void {
    this.requireLocation(id).shape.setAttribute(name, value);
  }

  /**
   * Project convention: DFS member order; nearest common parent; insert before
   * the earliest affected branch. Ancestor/descendant selections are rejected.
   */
  group(newId: string, ids: readonly string[]): void {
    this.withStructureCopy(work => {
      const group = new Group(newId);
      const all = work.locations();
      if (all.some(location => location.shape.id === newId)) {
        throw new Error(`id already exists: ${newId}`);
      }
      if (ids.length === 0) throw new Error("group requires at least one shape");
      const requested = new Set(ids);
      if (requested.size !== ids.length) throw new Error("duplicate group member");
      for (const id of requested) work.requireLocation(id, all);
      const selected = all.filter(location => requested.has(location.shape.id));
      for (const location of selected) {
        const ancestor = location.ancestors.find(parent => parent !== null && requested.has(parent.id));
        if (ancestor) {
          throw new Error(`cannot group a container into its own descendant: ${ancestor.id}`);
        }
      }
      const first = selected[0]!;
      let commonLength = first.ancestors.length;
      for (const location of selected) {
        commonLength = Math.min(commonLength, location.ancestors.length);
        let depth = 0;
        while (depth < commonLength && first.ancestors[depth] === location.ancestors[depth]) depth++;
        commonLength = depth;
      }
      const parent = first.ancestors[commonLength - 1]!;
      const siblings = work.childrenOf(parent);
      const position = Math.min(...selected.map(location => {
        const branch = location.ancestors[commonLength] ?? location.shape;
        return siblings.indexOf(branch);
      }));
      // There are no selected ancestor/descendant pairs, so every source parent
      // survives. detach resolves current positions after earlier removals.
      for (const location of selected) {
        work.detach(location);
        group.addChild(location.shape);
      }
      work.insert(parent, group, position);
    });
  }

  ungroup(id: string): void {
    this.withStructureCopy(work => {
      const location = work.requireLocation(id);
      if (!(location.shape instanceof Group)) throw new Error(`not a container: ${id}`);
      if (location.parent === null) throw new Error(`cannot ungroup top-level container: ${id}`);
      const group = location.shape;
      const children = group.children;
      work.detach(location);
      children.forEach((child, offset) => {
        group.removeChild(child);
        work.insert(location.parent, child, location.index + offset);
      });
    });
  }

  addTo(groupId: string, id: string): void {
    this.withStructureCopy(work => {
      const target = work.requireContainer(groupId);
      const source = work.requireLocation(id);
      const destination = work.requireLocation(groupId);
      if (source.shape === target || destination.ancestors.some(parent => parent === source.shape)) {
        throw new Error("cannot move a shape into itself or its descendant");
      }
      work.detach(source);
      target.addChild(source.shape);
    });
  }

  bringToFront(id: string): void {
    this.reorder(id, true);
  }

  sendToBack(id: string): void {
    this.reorder(id, false);
  }

  clone(): SvgDocument {
    const copy = new SvgDocument(this._width, this._height);
    copy.roots = this.roots.map(shape => shape.clone());
    return copy;
  }

  private validateDimension(value: number, name: string): void {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`canvas ${name} must be a finite positive number`);
    }
  }

  private validateIndex(index: number, length: number): void {
    if (!Number.isInteger(index) || index < 0 || index > length) throw new Error("invalid child index");
  }

  private childrenOf(parent: Container): readonly Shape[] {
    return parent === null ? this.roots : parent.children;
  }

  private locations(): Location[] {
    const result: Location[] = [];
    const visit = (parent: Container, ancestors: readonly Container[]): void => {
      this.childrenOf(parent).forEach((shape, index) => {
        result.push({ shape, parent, index, ancestors });
        if (shape instanceof Group) visit(shape, [...ancestors, shape]);
      });
    };
    visit(null, [null]);
    return result;
  }

  private requireLocation(id: string, locations = this.locations()): Location {
    const result = locations.find(location => location.shape.id === id);
    if (result === undefined) throw new Error(`no such shape: ${id}`);
    return result;
  }

  private requireContainer(id: string): Group {
    const location = this.locations().find(entry => entry.shape.id === id);
    if (!location) throw new Error(`no such container: ${id}`);
    if (!(location.shape instanceof Group)) throw new Error(`not a container: ${id}`);
    return location.shape;
  }

  private insert(parent: Container, shape: Shape, index: number): void {
    if (parent === null) this.roots.splice(index, 0, shape);
    else parent.addChild(shape, index);
  }

  private detach(location: Location): void {
    if (location.parent === null) this.roots.splice(this.roots.indexOf(location.shape), 1);
    else location.parent.removeChild(location.shape);
  }

  private reorder(id: string, front: boolean): void {
    const location = this.requireLocation(id);
    const target = front ? this.childrenOf(location.parent).length - 1 : 0;
    if (target === location.index) return;
    // Root reordering needs no potentially throwing Group calls.
    if (location.parent === null) {
      this.roots.splice(location.index, 1);
      this.roots.splice(target, 0, location.shape);
    } else {
      this.withStructureCopy(work => {
        const current = work.requireLocation(id);
        work.detach(current);
        work.insert(current.parent, current.shape, target);
      });
    }
  }

  /** Group has no non-throwing batch commit API, so multi-step edits use a copy. */
  private withStructureCopy(edit: (work: SvgDocument) => void): void {
    const work = this.clone();
    edit(work);
    this.validateForest(work.roots);
    this.roots = work.roots;
  }

  private validateForest(roots: readonly Shape[], reservedIds: ReadonlySet<string> = new Set()): void {
    const ids = new Set(reservedIds);
    const seen = new Set<Shape>();
    const active = new Set<Shape>();
    const visit = (shape: Shape): void => {
      if (active.has(shape)) throw new Error("circular containment");
      if (seen.has(shape)) throw new Error(`shape has multiple parents: ${shape.id}`);
      if (ids.has(shape.id)) throw new Error(`id already exists: ${shape.id}`);
      seen.add(shape);
      ids.add(shape.id);
      active.add(shape);
      if (shape instanceof Group) shape.children.forEach(visit);
      active.delete(shape);
    };
    roots.forEach(visit);
  }
}
