import type { TreeDecorator, TreeDecorationContext } from "../../src/api";
export class BoxDecorator implements TreeDecorator {
  readonly name = "box-type-label";
  tags(context: TreeDecorationContext): readonly string[] { return context.node?.kind === "box" ? ["(box)"] : []; }
}
