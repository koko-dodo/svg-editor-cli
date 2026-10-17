import type { CreateRequest, ShapeDetails } from "../services/EditorTypes";
import { Tokenizer } from "./Tokenizer";
import type { Token } from "./Tokenizer";

interface ShapeDescription {
  readonly tag: CreateRequest["type"];
  readonly modelType: string;
  readonly fields: readonly string[];
  readonly optionalStyle?: "fill" | "stroke";
  readonly summary: string;
  readonly position: string | null;
}

/** Single source for CLI create grammar and presentation labels/layouts. */
export class ShapeSyntax {
  private readonly descriptions: readonly ShapeDescription[] = [
    { tag: "rect", modelType: "Rectangle", fields: ["x", "y", "width", "height"], optionalStyle: "fill", summary: "x={x} y={y} w={width} h={height}", position: "({x},{y})" },
    { tag: "circle", modelType: "Circle", fields: ["cx", "cy", "r"], optionalStyle: "fill", summary: "cx={cx} cy={cy} r={r}", position: "({cx},{cy})" },
    { tag: "ellipse", modelType: "Ellipse", fields: ["cx", "cy", "rx", "ry"], optionalStyle: "fill", summary: "cx={cx} cy={cy} rx={rx} ry={ry}", position: "({cx},{cy})" },
    { tag: "line", modelType: "Line", fields: ["x1", "y1", "x2", "y2"], optionalStyle: "stroke", summary: "({x1},{y1}) -> ({x2},{y2})", position: "({x1},{y1}) -> ({x2},{y2})" },
    { tag: "text", modelType: "TextShape", fields: ["x", "y", "text"], summary: "({x},{y}) {text}", position: "({x},{y})" },
    { tag: "g", modelType: "Group", fields: [], summary: "", position: null },
  ];

  parse(tokens: readonly Token[]): CreateRequest {
    if (tokens.length < 2) throw new Error("usage: create <type> <id> [params...] [in <containerId>]");
    const type = tokens[0]!.value;
    const definition = this.descriptions.find(item => item.tag === type);
    if (!definition) throw new Error(`unknown shape type: ${type} (is the plugin loaded?)`);
    let body = tokens.slice(2);
    let parentId: string | undefined;
    // Recognize a suffix only AFTER all required positional fields. Quoted
    // "in" is always data, including text content and optional style values.
    const suffix = body.length - 2;
    if (suffix >= definition.fields.length && body[suffix]?.value === "in" && !body[suffix]?.quoted) {
      parentId = body[suffix + 1]!.value;
      body = body.slice(0, suffix);
    }
    const min = definition.fields.length;
    const max = min + (definition.optionalStyle === undefined ? 0 : 1);
    if (body.length < min || body.length > max ||
        (body.length === min + 1 && body[min]!.value === "in" && !body[min]!.quoted)) {
      throw new Error(`usage: ${this.usage(definition)}`);
    }
    const request: Record<string, string | number> = { type, id: tokens[1]!.value };
    definition.fields.forEach((field, index) => {
      request[field] = field === "text" ? body[index]!.value : Tokenizer.number(body[index]!, field);
    });
    if (definition.optionalStyle !== undefined && body.length > min) request[definition.optionalStyle] = body[min]!.value;
    if (parentId !== undefined) request.parentId = parentId;
    // The descriptor above has validated the precise fields of this variant.
    return Object.freeze(request) as unknown as CreateRequest;
  }

  tag(modelType: string): string { return this.description(modelType)?.tag ?? modelType; }
  fields(modelType: string): readonly string[] { return this.description(modelType)?.fields ?? []; }
  summary(shape: ShapeDetails): string { return this.render(this.description(shape.type)?.summary ?? "", shape); }
  position(shape: ShapeDetails): string | null {
    const template = this.description(shape.type)?.position;
    return template == null ? null : this.render(template, shape);
  }
  help(): readonly string[] { return this.descriptions.map(item => this.usage(item)); }

  private description(modelType: string): ShapeDescription | undefined {
    return this.descriptions.find(item => item.modelType === modelType);
  }
  private usage(item: ShapeDescription): string {
    const fields = item.fields.map(field => field === "text" ? '"content"' : `<${field}>`).join(" ");
    return `create ${item.tag} <id>${fields ? ` ${fields}` : ""}${item.optionalStyle ? ` [${item.optionalStyle}]` : ""} [in <containerId>]`;
  }
  private render(template: string, shape: ShapeDetails): string {
    return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
      const value = shape.attributes[key];
      return typeof value === "string" ? JSON.stringify(value) : String(value);
    });
  }
}
