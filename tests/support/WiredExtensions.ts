// Integration doubles use only the public API and other public-API doubles.
import type {
  Attributes, AttributeValue, Command, CommandInvocation, CommandResult, CommandToken,
  FeedbackContext, Shape, ShapeCreateArguments, ShapePresentation, ShapeProvider,
  ShapeServices, ShapeView, SvgElementData, TreeDecorationContext, TreeDecorator,
} from "../../src/api";
import { ProbeLeaf, RequiredPartsContainer, composite } from "./ContractShapes";

export class RequiredProvider implements ShapeProvider {
  readonly kind = "required-parts";
  readonly createSyntax = "create required-parts <id>";
  readonly svg = { namespace: "http://www.w3.org/2000/svg", localName: "g", dataKind: "required-parts" };
  parseCreate(args: readonly CommandToken[]): ShapeCreateArguments {
    if (args.length !== 0) throw new Error("unexpected composite arguments");
    return { parameters: {} };
  }
  create(id: string): Shape { return composite(id); }
  read(_element: SvgElementData, id: string, children: readonly Shape[]): Shape {
    const shape = new RequiredPartsContainer(id);
    children.forEach(child => shape.addChild(child));
    return shape;
  }
  write(node: ShapeView): SvgElementData {
    return { ...this.svg, attributes: { id: node.id, "data-kind": this.kind }, text: "" };
  }
  present(node: ShapeView): ShapePresentation {
    return { tag: "g", summary: `parts=${node.children.length}`, position: null, geometry: [], styles: [] };
  }
  readAttribute(node: ShapeView, name: string): AttributeValue | undefined { return node.attributes[name]; }
}

/** Flexible feedback double; no production plugin business rules. */
export class FeedbackLeafProvider implements ShapeProvider {
  readonly kind = "probe-leaf";
  readonly svg = { namespace: "urn:test:svg", localName: "probe" };
  readonly createSyntax = "create probe-leaf <id> <value>";
  calls: string[] = [];
  fail: string | undefined;
  rawLine: string | undefined;
  enabled = true;
  parseCreate(args: readonly CommandToken[]): ShapeCreateArguments {
    return { parameters: { value: Number(args[0]?.value ?? 1) } };
  }
  create(id: string, parameters: Attributes, _services: ShapeServices): Shape { return new ProbeLeaf(id, Number(parameters.value)); }
  read(element: SvgElementData, id: string): Shape { return new ProbeLeaf(id, Number(element.attributes.value)); }
  write(node: ShapeView): SvgElementData {
    return { ...this.svg, attributes: { id: node.id, value: String(node.attributes.value) }, text: "" };
  }
  present(node: ShapeView): ShapePresentation {
    return { tag: "probe", summary: `v=${node.attributes.value}`, position: null, geometry: [["value", node.attributes.value!]], styles: [] };
  }
  readAttribute(node: ShapeView, name: string) { return node.attributes[name]; }
  describeOperation(context: FeedbackContext): readonly string[] | undefined {
    this.calls.push(context.direction);
    if (this.fail === context.direction) throw new Error("feedback failed");
    return this.enabled ? [this.rawLine ?? `shape ${context.result.operation} ${context.direction}`] : undefined;
  }
}

export class CallbackCommand implements Command {
  readonly syntax: string;
  constructor(readonly name: string, private readonly plan: () => CommandInvocation) { this.syntax = name; }
  parse(): CommandInvocation { return this.plan(); }
  describeOperation(context: FeedbackContext): readonly string[] { return [`command ${this.name} ${context.direction}`]; }
}
export class ObservationDecorator implements TreeDecorator {
  readonly observations: TreeDecorationContext[] = [];
  constructor(readonly name: string) {}
  tags(context: TreeDecorationContext): readonly string[] {
    this.observations.push(context);
    return [this.name];
  }
}
export const edited = (id: string): CommandResult => ({ operation: "move", targetIds: [id], parameters: { dx: 1, dy: 0 } });
