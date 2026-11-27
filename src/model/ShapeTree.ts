import type { Attributes } from "../api/Domain";
import { Shape } from "./Shape";

/** Structural checks precede clone: cloning may otherwise unfold shared nodes. */
export function validateForest(roots: readonly Shape[], reservedIds: ReadonlySet<string> = new Set()): void {
  const ids = new Set(reservedIds);
  const seen = new Set<Shape>();
  const active = new Set<Shape>();
  const visit = (shape: Shape): void => {
    if (active.has(shape)) throw new Error("circular containment");
    if (seen.has(shape)) throw new Error(`shape has multiple parents: ${shape.id}`);
    if (typeof shape.id !== "string" || shape.id.trim() === "") throw new Error("id must not be empty");
    if (ids.has(shape.id)) throw new Error(`id already exists: ${shape.id}`);
    if (typeof shape.kind !== "string" || shape.kind.trim() === "") throw new Error("shape kind must not be empty");
    seen.add(shape);
    ids.add(shape.id);
    active.add(shape);
    const container = shape.asContainer();
    if (container !== null) {
      if (container !== shape) throw new Error("container must identify itself");
      if (container.ungroupPolicy !== "expand" && container.ungroupPolicy !== "reject-composite") {
        throw new Error("invalid ungroup policy");
      }
      container.children.forEach(visit);
    }
    active.delete(shape);
  };
  roots.forEach(visit);
}

/** Copy scalar protocol values only, even if a plugin returns its own object. */
export function attributesOf(shape: Shape): Attributes {
  const attributes: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(shape.attributes())) {
    if (typeof value !== "string" && !(typeof value === "number" && Number.isFinite(value))) {
      throw new Error("invalid shape attribute value");
    }
    Object.defineProperty(attributes, key, { value, enumerable: true });
  }
  return Object.freeze(attributes);
}

function description(shape: Shape): unknown {
  return {
    id: shape.id, kind: shape.kind, attributes: Object.entries(attributesOf(shape)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
    policy: shape.asContainer()?.ungroupPolicy,
    children: shape.asContainer()?.children.map(description) ?? null,
  };
}

/**
 * Inspect reachable own data properties (including TS-private properties).
 * This catches common shallow clones, not all JS internal state: ECMAScript
 * private fields, closures and other internal slots may be invisible.
 */
function references(value: unknown, found = new Set<object>()): Set<object> {
  if (value === null || typeof value !== "object" || found.has(value)) return found;
  found.add(value);
  if (value instanceof Map) for (const [key, item] of value) { references(key, found); references(item, found); }
  if (value instanceof Set) for (const item of value) references(item, found);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if ("value" in descriptor) references(descriptor.value, found);
  }
  return found;
}

/** Supplementary structural/reference defense; Shape.clone remains a plugin obligation. */
export function cloneForest(roots: readonly Shape[]): Shape[] {
  validateForest(roots);
  const before = JSON.stringify(roots.map(description));
  const originals = references(roots);
  const copies = roots.map(shape => shape.clone());
  validateForest(copies);
  if (JSON.stringify(copies.map(description)) !== before || JSON.stringify(roots.map(description)) !== before) {
    throw new Error("clone must preserve shape semantics");
  }
  const sameTypes = (a: Shape, b: Shape): boolean =>
    Object.getPrototypeOf(a) === Object.getPrototypeOf(b) &&
    (a.asContainer()?.children ?? []).every((child, index) => sameTypes(child, b.asContainer()!.children[index]!));
  if (!roots.every((root, index) => sameTypes(root, copies[index]!))) throw new Error("clone must preserve shape type");
  for (const reference of references(copies)) {
    const plain = Array.isArray(reference) || Object.getPrototypeOf(reference) === Object.prototype || Object.getPrototypeOf(reference) === null;
    if (originals.has(reference) && (reference instanceof Shape || !plain || !Object.isFrozen(reference))) {
      throw new Error("clone shares mutable state");
    }
  }
  return copies;
}

/**
 * Committed snapshots are never edited; future actions receive mutable clones.
 * Object.freeze does not freeze Map/Set entries, private fields or closure state.
 * This guard is not a sandbox or a complete proof of plugin-state immutability.
 */
export function freezeModel(roots: readonly Shape[]): void {
  for (const value of references(roots)) Object.freeze(value);
}
