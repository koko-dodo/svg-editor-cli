import { parseNumberToken } from "../../../../src/api";
import type { Attributes, CommandToken, ShapeProvider, ShapeView, SvgElementData } from "../../../../src/api";
import { LoaderLeaf } from "./LoaderLeaf";

export class LoaderProvider implements ShapeProvider {
  readonly kind = "loader-leaf";
  readonly svg = { namespace: "urn:loader-test", localName: "leaf" };
  readonly createSyntax = "create loader-leaf <id> <value>";
  parseCreate(args: readonly CommandToken[]) { return { parameters: { value: parseNumberToken(args[0]!, "value") } }; }
  create(id: string, parameters: Attributes) { return new LoaderLeaf(id, Number(parameters.value)); }
  read(element: SvgElementData, id: string) { return this.create(id, { value: Number(element.attributes.value) }); }
  write(node: ShapeView) { return { ...this.svg, attributes: { id: node.id, value: String(node.attributes.value) }, text: "" }; }
  present(node: ShapeView) { return { tag: "leaf", summary: `value=${node.attributes.value}`, position: null, geometry: [["value", node.attributes.value!] as const], styles: [] }; }
  readAttribute(node: ShapeView, name: string) { return node.attributes[name]; }
}
