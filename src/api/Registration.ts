import type { ShapeProvider } from "./ShapeProvider";
import type { Command } from "./Command";
import type { TreeDecorator } from "./TreeDecorator";
import type { AttributeHandler } from "./AttributeHandler";

export interface ContributionNames {
  readonly shapes: readonly string[];
  readonly commands: readonly string[];
  readonly decorators: readonly string[];
  readonly attributes: readonly string[];
}
/** Activation-only capability. No document, mutable maps, lookup or commit authority. */
export interface RegistrationContext {
  registerShape(provider: ShapeProvider): void;
  registerCommand(command: Command): void;
  registerDecorator(decorator: TreeDecorator): void;
  registerAttribute(handler: AttributeHandler): void;
}
