import type { FeedbackContext, CommitPreparation, OperationFeedback, ShapeView } from "../api";
import type { ExtensionRegistry } from "../extensions/ExtensionRegistry";

/** Resolves callbacks before History publishes a candidate or moves either stack. */
export class FeedbackResolver {
  constructor(private readonly registry: ExtensionRegistry) {}

  prepare(input: FeedbackContext): CommitPreparation {
    const context = Object.freeze({ ...input, shapes: this.registry.shapeServices() });
    const owner = input.result.feedbackOwner;
    let explicit: Partial<OperationFeedback> | undefined;
    if (owner) {
      explicit = owner.category === "shapes" ? this.registry.shape(owner.name) : this.registry.attribute(owner.name);
      if (!explicit?.describeOperation) throw new Error(`missing feedback owner: ${owner.category}/${owner.name}`);
    }
    const find = (nodes: readonly ShapeView[]): ShapeView | undefined => {
      for (const node of nodes) {
        if (node.id === input.result.targetIds[0]) return node;
        const nested = find(node.children);
        if (nested) return nested;
      }
      return undefined;
    };
    const target = find(input.after.roots) ?? find(input.before.roots);
    const provider = target && this.registry.shape(target.kind);
    const command = this.registry.command(input.result.commandName ?? input.result.operation);
    // Undefined requests the next fallback. Empty array deliberately suppresses feedback.
    const automatic = provider === explicit ? undefined : provider;
    const feedback = explicit?.describeOperation?.(context)
      ?? automatic?.describeOperation?.(context)
      ?? command?.describeOperation?.(context)
      ?? [];
    return { feedback };
  }
}
