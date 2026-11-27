// Test plugin implementations depend only on the public API and a public-API model double.
import type {
  AttributeHandler, AttributeMatchContext, AttributeMutation, AttributeRequest, Command,
  CommandInvocation, CommandToken, FeedbackContext, RegistrationContext, ShapeCreateArguments,
  ShapePresentation, ShapeProvider, ShapeServices, ShapeView, SvgElementData, SvgSelector,
  Attributes, Shape, TreeDecorationContext, TreeDecorator,
} from "../../src/api";
import { ProbeLeaf } from "./ContractShapes";

export class ProbeProvider implements ShapeProvider {
  readonly createSyntax = "probe-leaf <id> <value>";
  constructor(readonly kind = "probe-leaf", readonly svg: SvgSelector = {
    namespace: "urn:test:svg", localName: "probe",
  }) {}
  parseCreate(args: readonly CommandToken[]): ShapeCreateArguments {
    if (args.length !== 1 || !Number.isFinite(Number(args[0]!.value))) throw new Error("invalid probe arguments");
    return { parameters: { value: Number(args[0]!.value) } };
  }
  create(id: string, parameters: Attributes, _services: ShapeServices): ProbeLeaf {
    return new ProbeLeaf(id, Number(parameters.value));
  }
  read(element: SvgElementData, assignedId: string, _children: readonly Shape[], services: ShapeServices): ProbeLeaf {
    return this.create(assignedId, { value: Number(element.attributes.value) }, services);
  }
  write(node: ShapeView): SvgElementData {
    return { namespace: this.svg.namespace, localName: this.svg.localName,
      attributes: { id: node.id, value: String(node.attributes.value) }, text: "" };
  }
  present(node: ShapeView): ShapePresentation {
    return { tag: "probe", summary: `value=${node.attributes.value}`, position: null,
      geometry: [["value", node.attributes.value!]], styles: [] };
  }
  readAttribute(node: ShapeView, name: string) { return node.attributes[name]; }
  describeOperation(context: FeedbackContext): readonly string[] { return [`probe ${context.direction}`]; }
}
export class ProbeQueryCommand implements Command {
  readonly syntax = "inspect-probe";
  constructor(readonly name = "inspect-probe") {}
  parse(args: readonly CommandToken[]): CommandInvocation {
    if (args.length !== 0) throw new Error("usage: inspect-probe");
    return { mode: "query", execute: context => ({
      stdout: [context.document === null ? "none" : String(context.document.view().roots.length)], stderr: [],
    }) };
  }
}
export class ProbeEditCommand implements Command {
  readonly name = "tweak-probe";
  readonly syntax = "tweak-probe <id> <value>";
  describeOperation(context: FeedbackContext): readonly string[] { return [`tweak ${context.direction}`]; }
  parse(args: readonly CommandToken[]): CommandInvocation {
    if (args.length !== 2) throw new Error("usage: tweak-probe <id> <value>");
    const id = args[0]!.value, value = Number(args[1]!.value);
    return { mode: "edit", execute: context => {
      context.document.setDefault(id, "value", value);
      return { operation: "set", targetIds: [id], parameters: { name: "value", value } };
    } };
  }
}
export class ProbeDecorator implements TreeDecorator {
  constructor(readonly name: string, private readonly label: string) {}
  tags(_context: TreeDecorationContext): readonly string[] { return [this.label]; }
}
export class ProbeAttribute implements AttributeHandler {
  constructor(readonly name = "probe-pair", private readonly fail = false) {}
  handles(context: AttributeMatchContext): boolean {
    return context.target.kind === "probe-leaf" && context.name === "pair";
  }
  apply(context: AttributeMutation, request: AttributeRequest): void {
    context.setDefault(request.targetId, "value", request.value);
    if (this.fail) throw new Error("probe apply failed");
    context.setDefault(request.targetId, "stroke-width", request.value);
  }
  describeOperation(context: FeedbackContext): readonly string[] { return [`pair ${context.direction}`]; }
}
export function activateProbe(context: RegistrationContext): void {
  context.registerShape(new ProbeProvider());
  context.registerCommand(new ProbeQueryCommand());
  context.registerCommand(new ProbeEditCommand());
  context.registerDecorator(new ProbeDecorator("probe-tag", "(probe)"));
  context.registerAttribute(new ProbeAttribute());
}
