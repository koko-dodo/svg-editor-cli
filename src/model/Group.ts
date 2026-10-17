import { Shape } from "./Shape";
import type { ShapeStyle } from "./Shape";

/** Local containment only; SvgDocument will enforce unique IDs and single parents. */
export class Group extends Shape {
  private readonly _children: Shape[] = [];

  constructor(id: string, style: ShapeStyle = {}) {
    super(id, style);
  }

  /** A frozen structural snapshot; its elements retain their original identities. */
  get children(): readonly Shape[] {
    return Object.freeze([...this._children]);
  }

  indexOf(child: Shape): number {
    return this._children.indexOf(child);
  }

  addChild(child: Shape, index: number = this._children.length): void {
    if (!Number.isInteger(index) || index < 0 || index > this._children.length) {
      throw new Error("invalid child index");
    }
    if (this._children.includes(child)) throw new Error("child already exists in group");
    if (child === this || (child instanceof Group && child.contains(this))) {
      throw new Error("cannot create circular containment");
    }
    this._children.splice(index, 0, child);
  }

  removeChild(child: Shape): Shape {
    const index = this.indexOf(child);
    if (index < 0) throw new Error("not a direct child of group");
    this._children.splice(index, 1);
    return child;
  }

  override move(dx: number, dy: number): void {
    this.finite(dx, "dx");
    this.finite(dy, "dy");
    this.transform(shape => shape.move(dx, dy));
  }

  override scale(factor: number): void {
    this.scaleFactor(factor);
    this.transform(shape => shape.scale(factor));
  }

  protected override setOwnAttribute(name: string, _value: string | number): void {
    throw new Error(`unknown attribute: ${name}`);
  }

  override clone(): Group {
    const copy = new Group(this.id, this.copyStyle());
    for (const child of this._children) copy.addChild(child.clone());
    return copy;
  }

  private contains(target: Shape, visited = new Set<Group>()): boolean {
    if (visited.has(this)) return false;
    visited.add(this);
    return this._children.some(child => child === target ||
      (child instanceof Group && child.contains(target, visited)));
  }

  private collectLeaves(leaves: Shape[]): void {
    for (const child of this._children) {
      if (child instanceof Group) child.collectLeaves(leaves);
      else leaves.push(child);
    }
  }

  /**
   * Preflight before touching originals; preserves all existing object references.
   * Assumes synchronous, deterministic transforms and faithful clones, as provided
   * by the five built-in leaves. Arbitrary side-effecting plugins need a stronger
   * prepare/commit protocol before they can share this atomicity guarantee.
   */
  private transform(operation: (shape: Shape) => void): void {
    const leaves: Shape[] = [];
    this.collectLeaves(leaves);
    const previews = new Map<Shape, Shape>();
    for (const leaf of leaves) {
      let preview = previews.get(leaf);
      if (preview === undefined) {
        preview = leaf.clone();
        previews.set(leaf, preview);
      }
      // Shared nodes are currently allowed: simulate each visit cumulatively,
      // exactly as the commit traversal will, including possible later overflow.
      operation(preview);
    }
    for (const leaf of leaves) operation(leaf);
  }
}
