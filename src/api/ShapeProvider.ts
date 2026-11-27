import type { Shape } from "../model/Shape";
import type { Attributes, AttributeValue, ShapeView } from "./Domain";
import type { CommandToken } from "./Command";
import type { OperationFeedback } from "./Feedback";

/** URI/local name, never an XML prefix. Omitted dataKind is the base selector. */
export interface SvgSelector {
  readonly namespace: string;
  readonly localName: string;
  readonly dataKind?: string;
}
/** One XML element only. The reader/writer owns ordered child recursion. */
export interface SvgElementData {
  readonly namespace: string;
  readonly localName: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly text: string;
}
export interface ShapeCreateArguments {
  readonly parameters: Attributes;
  readonly parentId?: string;
}
export interface ShapeServices {
  present(node: ShapeView): ShapePresentation;
  createHelp(): readonly string[];
  parseCreate(kind: string, args: readonly CommandToken[]): ShapeCreateArguments;
  create(kind: string, id: string, parameters: Attributes): Shape;
  readAttribute(node: ShapeView, name: string): AttributeValue | undefined;
}
export interface ShapePresentation {
  readonly tag: string;
  readonly summary: string;
  readonly position: string | null;
  readonly geometry: readonly (readonly [string, AttributeValue])[];
  readonly styles: readonly (readonly [string, AttributeValue])[];
}
/** Optional declarative validation before constructing a node. Omission delegates
 * attribute/direct-text/child acceptance to read(); XML safety and global IDs
 * remain kernel checks. xmlns and data-kind metadata are handled by the reader.
 */
export interface SvgReadPolicy {
  readonly attributes: readonly string[];
  readonly text: boolean;
  readonly children: boolean;
}
export interface ShapeProvider extends Partial<OperationFeedback> {
  readonly kind: string;
  readonly svg: SvgSelector;
  readonly createSyntax: string;
  readonly readPolicy?: SvgReadPolicy;
  parseCreate(args: readonly CommandToken[]): ShapeCreateArguments;
  create(id: string, parameters: Attributes, services: ShapeServices): Shape;
  /** Synchronous; inputs are detached nodes. Preserve assigned ID/kind and all
   * ordered descendants. Do not edit the supplied children. Final-tree validation
   * runs before installing the read document; recognized failures never downgrade.
   */
  read(element: SvgElementData, assignedId: string, children: readonly Shape[], services: ShapeServices): Shape;
  write(node: ShapeView): SvgElementData;
  present(node: ShapeView): ShapePresentation;
  readAttribute(node: ShapeView, name: string): AttributeValue | undefined;
}
