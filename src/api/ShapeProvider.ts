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
export interface ShapeProvider extends Partial<OperationFeedback> {
  readonly kind: string;
  readonly svg: SvgSelector;
  readonly createSyntax: string;
  parseCreate(args: readonly CommandToken[]): ShapeCreateArguments;
  create(id: string, parameters: Attributes, services: ShapeServices): Shape;
  /** Inputs are detached nodes. Preserve assigned IDs and ordered children. */
  read(element: SvgElementData, assignedId: string, children: readonly Shape[], services: ShapeServices): Shape;
  write(node: ShapeView): SvgElementData;
  present(node: ShapeView): ShapePresentation;
  readAttribute(node: ShapeView, name: string): AttributeValue | undefined;
}
