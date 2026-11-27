import { parseNumberToken, parseSvgNumber } from "../../src/api";
import type { Attributes, CommandToken, FeedbackContext, Shape, ShapeProvider, ShapeServices, ShapeStyle, ShapeView, SvgElementData } from "../../src/api";
import { Box } from "./Box";
import { find, part, singleLine } from "./BoxView";

export class BoxProvider implements ShapeProvider {
  readonly kind = "box";
  readonly svg = { namespace: "http://www.w3.org/2000/svg", localName: "g", dataKind: "box" };
  readonly createSyntax = 'create box <id> <x> <y> <w> <h> "<标题>" [in <containerId>]';
  readonly readPolicy = { attributes: ["id","fill","stroke","stroke-width"], text: false, children: true };
  parseCreate(args: readonly CommandToken[]) {
    const hasParent = args.length === 7 && args[5]?.value === "in" && !args[5].quoted;
    if (args.length !== 5 && !hasParent) throw new Error(`usage: ${this.createSyntax}`);
    return { parameters: { x: parseNumberToken(args[0]!,"x"), y: parseNumberToken(args[1]!,"y"),
      width: parseNumberToken(args[2]!,"width"), height: parseNumberToken(args[3]!,"height"), label: args[4]!.value },
      ...(hasParent ? { parentId: args[6]!.value } : {}) };
  }
  create(id: string, a: Attributes, services: ShapeServices): Box {
    const node = new Box(id);
    node.addChild(services.create("rect",`${id}-rect`,{x:a.x!,y:a.y!,width:a.width!,height:a.height!,fill:"#4a90d9"}));
    node.addChild(services.create("text",`${id}-label`,{x:Number(a.x)+20,y:Number(a.y)+35,text:a.label!}));
    return node;
  }
  read(element: SvgElementData, id: string, children: readonly Shape[]): Box {
    const a = element.attributes;
    const style: ShapeStyle = { ...(a.fill === undefined ? {} : {fill:a.fill}), ...(a.stroke === undefined ? {} : {stroke:a.stroke}),
      ...(a["stroke-width"] === undefined ? {} : {"stroke-width":parseSvgNumber(a["stroke-width"],"stroke-width")}) };
    const node = new Box(id,style);
    children.forEach(child=>node.addChild(child));return node;
  }
  write(node: ShapeView): SvgElementData {
    const attributes: Record<string,string> = {id:node.id,"data-kind":"box"};
    for (const name of ["fill","stroke","stroke-width"]) if (node.attributes[name] !== undefined) attributes[name]=String(node.attributes[name]);
    return {...this.svg,attributes,text:""};
  }
  present(node: ShapeView) {
    return {tag:"g",summary:"",position:null,geometry:[],styles:["fill","stroke","stroke-width"].filter(name=>node.attributes[name]!==undefined).map(name=>[name,singleLine(String(node.attributes[name]))] as const)};
  }
  readAttribute(node: ShapeView, name: string) {
    return name === "label" ? part(node,"label").attributes.text : name === "fill" ? part(node,"rect").attributes.fill : node.attributes[name];
  }
  describeOperation(context: FeedbackContext): readonly string[] | undefined {
    const {result,direction}=context,id=result.targetIds[0]!;
    const node=find(context.after,id)??find(context.before,id);
    if (!node || node.kind!==this.kind) return undefined;
    const label=`box#${singleLine(id)}`,undo=direction==="undo";
    const parent=node.parentId===null?"svg":`${context.shapes!.present(find(context.after,node.parentId)??find(context.before,node.parentId)!).tag}#${singleLine(node.parentId)}`;
    if(result.operation==="create")return [undo?`${label} deleted`:`${label} created (g#${singleLine(id)} + rect#${singleLine(id)}-rect + text#${singleLine(id)}-label)${node.parentId===null?"":` in ${parent}`}`];
    if(result.operation==="move")return [`${label} moved${undo?" back":""} by (${Number(result.parameters.dx)*(undo?-1:1)},${Number(result.parameters.dy)*(undo?-1:1)})`];
    if(result.operation==="delete")return [`${label} ${undo?`restored into ${parent}`:"deleted"}`];
    if(result.operation==="scale")return [undo?`${label} scale undone; geometry restored`:`${label} scaled by ${result.parameters.factor}`];
    return undefined;
  }
}
