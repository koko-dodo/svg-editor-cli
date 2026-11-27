// Freezing probes, not production plugins. All domain access uses the public API.
import { ContainerShape, parseNumberToken } from "../../src/api";
import type { AttributeHandler, AttributeMatchContext, AttributeMutation, AttributeRequest, Attributes, DocumentQuery,
  FeedbackContext, Shape, ShapeProvider, ShapeServices, ShapeView, SvgElementData } from "../../src/api";

export class PairNode extends ContainerShape {
  readonly kind = "audit-pair";
  readonly ungroupPolicy = "reject-composite" as const;
  override validate(query: DocumentQuery): void {
    for (const [suffix,kind] of [["surface","rect"],["caption","text"]]) {
      const node = query.find(`${this.id}-${suffix}`);
      if (node?.kind !== kind || node?.parentId !== this.id) throw new Error("invalid pair parts");
    }
  }
  clone(): PairNode {
    const result = new PairNode(this.id,this.copyStyle());
    this.children.forEach(child=>result.addChild(child.clone()));return result;
  }
}
export class PairProvider implements ShapeProvider {
  readonly kind = "audit-pair";
  readonly svg = {namespace:"http://www.w3.org/2000/svg",localName:"g",dataKind:this.kind};
  readonly createSyntax = "create audit-pair <id> <x> <y> <width> <height> <caption> [in <id>]";
  parseCreate(args: readonly import("../../src/api").CommandToken[]) {
    const parentId=args.length===7&&args[5]?.value==="in"?args[6]!.value:undefined;
    if(args.length!==(parentId===undefined?5:7))throw new Error("pair usage");
    return {parameters:{x:parseNumberToken(args[0]!,"x"),y:parseNumberToken(args[1]!,"y"),width:parseNumberToken(args[2]!,"width"),height:parseNumberToken(args[3]!,"height"),caption:args[4]!.value},...(parentId===undefined?{}:{parentId})};
  }
  create(id:string,a:Attributes,services:ShapeServices):PairNode {
    const node=new PairNode(id);
    node.addChild(services.create("rect",`${id}-surface`,{x:a.x!,y:a.y!,width:a.width!,height:a.height!}));
    // Probe coordinates are explicitly identical; this does not choose a production text-layout formula.
    node.addChild(services.create("text",`${id}-caption`,{x:a.x!,y:a.y!,text:a.caption!}));return node;
  }
  read(_element:SvgElementData,id:string,children:readonly Shape[]):PairNode {const node=new PairNode(id);children.forEach(child=>node.addChild(child));return node;}
  write(node:ShapeView):SvgElementData {return {...this.svg,attributes:{id:node.id,"data-kind":this.kind},text:""};}
  present(){return {tag:"g",summary:"",position:null,geometry:[],styles:[]};}
  readAttribute(node:ShapeView,name:string){return name==="caption"?node.children.find(child=>child.id===`${node.id}-caption`)?.attributes.text:node.attributes[name];}
  describeOperation(context:FeedbackContext):readonly string[]|undefined {
    if(!["create","move","delete"].includes(context.result.operation))return undefined;
    return [`pair ${context.result.operation} ${context.direction}`];
  }
}
export class PairAttributes implements AttributeHandler {
  readonly name="audit-pair-attributes";
  handles(context:AttributeMatchContext):boolean {return context.target.kind==="audit-pair"&&["tone","caption"].includes(context.name);}
  apply(context:AttributeMutation,request:AttributeRequest):void {
    const suffix=request.name==="tone"?"surface":"caption",attribute=request.name==="tone"?"fill":"text";
    context.setDefault(`${request.targetId}-${suffix}`,attribute,request.value);
  }
  describeOperation(context:FeedbackContext):readonly string[] {
    const id=context.result.targetIds[0]!,name=String(context.result.parameters.name);
    const find=(nodes:readonly ShapeView[]):ShapeView|undefined=>{for(const node of nodes){if(node.id===id)return node;const found=find(node.children);if(found)return found;}return undefined;};
    const parent=find(context.after.roots)!;
    const value=parent.children.find(child=>child.id===`${id}-${name==="tone"?"surface":"caption"}`)!.attributes[name==="tone"?"fill":"text"];
    return [`pair ${name} ${context.direction} ${JSON.stringify(value)}`];
  }
}
