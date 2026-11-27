import type { Shape } from "../model/Shape";
import type { CommandResult } from "./CommandResult";
import type { AttributeValue, DocumentQuery } from "./Domain";

/** Borrowed for one synchronous action; all methods expire when it returns/throws. */
export interface MutationPort extends DocumentQuery {
  addShape(detached: Shape, parentId?: string, index?: number): void;
  deleteShape(id: string): void;
  move(id: string, dx: number, dy: number): void;
  scale(id: string, factor: number): void;
  setDefault(id: string, name: string, value: AttributeValue): void;
  group(id: string, members: readonly string[]): void;
  ungroup(id: string): void;
  addTo(parentId: string, id: string): void;
  bringToFront(id: string): void;
  sendToBack(id: string): void;
}
/** An actual narrow object, not merely a type assertion over the full port. */
export interface AttributeMutation extends DocumentQuery {
  setDefault(id: string, name: string, value: AttributeValue): void;
}
export interface EditingAction {
  execute(context: MutationPort): CommandResult;
}
export interface AttributeAction {
  execute(context: AttributeMutation): CommandResult;
}
