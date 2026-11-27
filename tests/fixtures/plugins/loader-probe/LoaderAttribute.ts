import type { AttributeHandler, AttributeMatchContext, AttributeMutation, AttributeRequest, FeedbackContext } from "../../../../src/api";
export class LoaderAttribute implements AttributeHandler {
  readonly name = "loader-pair";
  handles(context: AttributeMatchContext): boolean { return context.target.kind === "loader-leaf" && context.name === "pair"; }
  apply(context: AttributeMutation, request: AttributeRequest): void {
    context.setDefault(request.targetId, "value", request.value);
    context.setDefault(request.targetId, "stroke-width", request.value);
  }
  describeOperation(context: FeedbackContext): readonly string[] { return [`pair ${context.direction}`]; }
}
