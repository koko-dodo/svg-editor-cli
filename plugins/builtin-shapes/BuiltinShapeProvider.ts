import { parseNumberToken, parseSvgNumber } from "../../src/api";
import type { Attributes, CommandToken, Shape, ShapeProvider, ShapeView, SvgElementData, ShapePresentation } from "../../src/api";
import { Rectangle } from "./Rectangle";
import { Circle } from "./Circle";
import { Ellipse } from "./Ellipse";
import { Line } from "./Line";
import { TextShape } from "./TextShape";
import { Group } from "./Group";
import type { ShapeDefinition } from "./ShapeFactory";
import { ShapeSchema } from "./ShapeSchema";

const constructors: Readonly<Record<string, (id: string, a: Attributes) => Shape>> = {
  rect: (id, a) => new Rectangle(id, a.x as number, a.y as number, a.width as number, a.height as number, a),
  circle: (id, a) => new Circle(id, a.cx as number, a.cy as number, a.r as number, a),
  ellipse: (id, a) => new Ellipse(id, a.cx as number, a.cy as number, a.rx as number, a.ry as number, a),
  line: (id, a) => new Line(id, a.x1 as number, a.y1 as number, a.x2 as number, a.y2 as number, a),
  text: (id, a) => new TextShape(id, a.x as number, a.y as number, a.text as string, a),
  g: (id, a) => new Group(id, a),
};
const layouts = [
  { tag: "rect", optionalStyle: "fill", summary: "x={x} y={y} w={width} h={height}", position: "({x},{y})" },
  { tag: "circle", optionalStyle: "fill", summary: "cx={cx} cy={cy} r={r}", position: "({cx},{cy})" },
  { tag: "ellipse", optionalStyle: "fill", summary: "cx={cx} cy={cy} rx={rx} ry={ry}", position: "({cx},{cy})" },
  { tag: "line", optionalStyle: "stroke", summary: "({x1},{y1}) -> ({x2},{y2})", position: "({x1},{y1}) -> ({x2},{y2})" },
  { tag: "text", optionalStyle: undefined, summary: "({x},{y}) {text}", position: "({x},{y})" },
  { tag: "g", optionalStyle: undefined, summary: "", position: null },
] as const;
const singleLine = (text: string) => text.replace(/\r/g, "\\r").replace(/\n/g, "\\n");

/** The actual built-in grammar, construction, SVG and presentation live here. */
export class BuiltinShapeProvider implements ShapeProvider {
  private readonly schema;
  private readonly layout;
  readonly kind: string;
  readonly svg;
  readonly readPolicy;
  readonly createSyntax: string;
  constructor(tag: ShapeDefinition["type"]) {
    this.kind = tag; this.schema = ShapeSchema.forTag(tag); this.layout = layouts.find(item => item.tag === tag)!;
    this.svg = Object.freeze({ namespace: "http://www.w3.org/2000/svg", localName: tag });
    this.readPolicy = Object.freeze({ attributes: Object.freeze(["id", ...this.schema.fields.filter(f => f !== "text"), ...ShapeSchema.styles]),
      text: tag === "text", children: tag === "g" });
    const fields = this.schema.fields.map(f => f === "text" ? '"content"' : `<${f}>`).join(" ");
    this.createSyntax = `create ${tag} <id>${fields ? ` ${fields}` : ""}${this.layout.optionalStyle ? ` [${this.layout.optionalStyle}]` : ""} [in <containerId>]`;
  }
  parseCreate(args: readonly CommandToken[]) {
    let body = args; let parentId: string | undefined;
    const suffix = body.length - 2;
    if (suffix >= this.schema.fields.length && body[suffix]?.value === "in" && !body[suffix]?.quoted) {
      parentId = body[suffix + 1]!.value; body = body.slice(0, suffix);
    }
    const min = this.schema.fields.length, max = min + (this.layout.optionalStyle === undefined ? 0 : 1);
    if (body.length < min || body.length > max || (body.length === min + 1 && body[min]!.value === "in" && !body[min]!.quoted)) {
      throw new Error(`usage: ${this.createSyntax}`);
    }
    const parameters: Record<string, string | number> = {};
    this.schema.fields.forEach((field, index) => { parameters[field] = field === "text" ? body[index]!.value : parseNumberToken(body[index]!, field); });
    if (this.layout.optionalStyle !== undefined && body.length > min) parameters[this.layout.optionalStyle] = body[min]!.value;
    return Object.freeze({ parameters: Object.freeze(parameters), ...(parentId === undefined ? {} : { parentId }) });
  }
  create(id: string, parameters: Attributes): Shape {
    return constructors[this.kind]!(id, parameters);
  }
  read(element: SvgElementData, assignedId: string, children: readonly Shape[]): Shape {
    const parameters: Record<string, string | number> = {};
    for (const name of this.schema.fields) parameters[name] = name === "text" ? element.text : parseSvgNumber(element.attributes[name] ?? null, name);
    for (const name of ShapeSchema.styles) if (element.attributes[name] !== undefined) {
      parameters[name] = name === "stroke-width" ? parseSvgNumber(element.attributes[name]!, name) : element.attributes[name]!;
    }
    const shape = this.create(assignedId, parameters);
    for (const child of children) shape.asContainer()!.addChild(child);
    return shape;
  }
  write(node: ShapeView): SvgElementData {
    const attributes: Record<string, string> = { id: node.id };
    for (const field of this.schema.fields) if (field !== "text") attributes[field] = String(node.attributes[field]);
    for (const style of ShapeSchema.styles) if (node.attributes[style] !== undefined) attributes[style] = String(node.attributes[style]);
    return { ...this.svg, attributes, text: this.kind === "text" ? String(node.attributes.text) : "" };
  }
  present(node: ShapeView): ShapePresentation {
    const value = (v: string | number | undefined) => typeof v === "string" ? JSON.stringify(v) : String(v);
    const render = (template: string) => template.replace(/\{(\w+)\}/g, (_all, key: string) => value(node.attributes[key]));
    return { tag: this.kind, summary: render(this.layout.summary), position: this.layout.position === null ? null : render(this.layout.position),
      geometry: this.schema.fields.map(key => [key, node.attributes[key]!] as const),
      styles: ShapeSchema.styles.filter(key => node.attributes[key] !== undefined).map(key => [key, singleLine(String(node.attributes[key]))] as const) };
  }
  readAttribute(node: ShapeView, name: string) { return node.attributes[name]; }
}
