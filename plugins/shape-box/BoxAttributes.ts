import type { AttributeHandler, AttributeMatchContext, AttributeMutation, AttributeRequest, FeedbackContext } from "../../src/api";
import { find, part, singleLine } from "./BoxView";
export class BoxAttributes implements AttributeHandler {
  readonly name = "box-attributes";
  handles(context: AttributeMatchContext): boolean { return context.target.kind === "box" && ["fill","label"].includes(context.name); }
  apply(context: AttributeMutation, request: AttributeRequest): void {
    context.setDefault(`${request.targetId}-${request.name === "fill" ? "rect" : "label"}`,request.name === "fill" ? "fill" : "text",request.value);
  }
  describeOperation(context: FeedbackContext): readonly string[] {
    const id=context.result.targetIds[0]!,node=find(context.after,id)!;
    const label=`box#${singleLine(id)}`,undo=context.direction==="undo";
    if(context.result.parameters.name==="label")return [`${label} label ${undo?"restored":"updated"}: ${JSON.stringify(part(node,"label").attributes.text)}`];
    return [undo?`${label} fill restored: ${part(node,"rect").attributes.fill===undefined?"<unset>":singleLine(String(part(node,"rect").attributes.fill))}`:`${label} fill propagated to ${singleLine(id)}-rect`];
  }
}
