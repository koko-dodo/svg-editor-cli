import type {
  AttributeAction, AttributeHandler, AttributeRequest, Command, ContributionNames,
  DocumentQuery, RegistrationContext, ShapeProvider, ShapeServices, SvgSelector,
  TreeDecorationContext, TreeDecorator,
} from "../api";
import { queryView } from "../model/DocumentView";

interface RegistryState {
  readonly shapes: ReadonlyMap<string, ShapeProvider>;
  readonly selectors: ReadonlyMap<string, ShapeProvider>;
  readonly commands: ReadonlyMap<string, Command>;
  readonly decorators: ReadonlyMap<string, TreeDecorator>;
  readonly attributes: ReadonlyMap<string, AttributeHandler>;
}

function key(value: string): string {
  if (typeof value !== "string" || value.length === 0 || /\s/.test(value)) throw new Error("invalid registration name");
  return value;
}
function selectorKey(selector: SvgSelector): string {
  return JSON.stringify([selector.namespace, selector.localName, selector.dataKind ?? null]);
}
function copySelector(selector: SvgSelector): SvgSelector {
  if (typeof selector.namespace !== "string" || key(selector.localName).includes(":")) throw new Error("invalid svg selector");
  return Object.freeze({ namespace: selector.namespace, localName: selector.localName,
    ...(selector.dataKind === undefined ? {} : { dataKind: key(selector.dataKind) }) });
}
function method<T extends object, K extends keyof T>(instance: T, name: K): T[K] {
  const value = instance[name];
  if (typeof value !== "function") throw new Error(`invalid extension method: ${String(name)}`);
  return value.bind(instance) as T[K];
}
function feedback<T extends ShapeProvider | AttributeHandler | Command>(instance: T) {
  return instance.describeOperation === undefined ? {} : { describeOperation: method(instance, "describeOperation")! };
}
function copyShape(instance: ShapeProvider): ShapeProvider {
  if (typeof instance.createSyntax !== "string" || instance.createSyntax.length === 0) throw new Error("invalid shape syntax");
  return Object.freeze({ kind: key(instance.kind), svg: copySelector(instance.svg), createSyntax: instance.createSyntax,
    parseCreate: method(instance, "parseCreate"), create: method(instance, "create"), read: method(instance, "read"),
    write: method(instance, "write"), present: method(instance, "present"), readAttribute: method(instance, "readAttribute"),
    ...feedback(instance) });
}
function copyCommand(instance: Command): Command {
  if (typeof instance.syntax !== "string" || instance.syntax.length === 0) throw new Error("invalid command syntax");
  return Object.freeze({ name: key(instance.name), syntax: instance.syntax, parse: method(instance, "parse"), ...feedback(instance) });
}
function copyDecorator(instance: TreeDecorator): TreeDecorator {
  return Object.freeze({ name: key(instance.name), tags: method(instance, "tags") });
}
function copyAttribute(instance: AttributeHandler): AttributeHandler {
  return Object.freeze({ name: key(instance.name), handles: method(instance, "handles"), apply: method(instance, "apply"), ...feedback(instance) });
}
/** Reject delayed mutation while consuming the rejected callback's eventual rejection. */
function requireVoid(value: unknown, message: string): void {
  if (value !== undefined) { void Promise.resolve(value).catch(() => {}); throw new Error(message); }
}
function names(state: Pick<RegistryState, "shapes" | "commands" | "decorators" | "attributes">): ContributionNames {
  return Object.freeze({ shapes: Object.freeze([...state.shapes.keys()]), commands: Object.freeze([...state.commands.keys()]),
    decorators: Object.freeze([...state.decorators.keys()]), attributes: Object.freeze([...state.attributes.keys()]) });
}
function emptyState(): RegistryState {
  return { shapes: new Map(), selectors: new Map(), commands: new Map(), decorators: new Map(), attributes: new Map() };
}

/** Host-owned registry. Plugins see only an expiring RegistrationContext. No module loading. */
export class ExtensionRegistry {
  #state: RegistryState = emptyState();
  #registering = false;

  register(activate: (context: RegistrationContext) => void,
    validate?: (contributions: ContributionNames) => void): ContributionNames {
    if (this.#registering) throw new Error("registration already in progress");
    this.#registering = true;
    let active = true, failed = false;
    let failure: unknown;
    const staged = { shapes: [] as ShapeProvider[], commands: [] as Command[],
      decorators: [] as TreeDecorator[], attributes: [] as AttributeHandler[] };
    const collect = <T>(items: T[], prepare: () => T): void => {
      if (!active) throw new Error("registration context has expired");
      try { items.push(prepare()); } catch (error) { failed = true; failure = error; throw error; }
    };
    const context: RegistrationContext = Object.freeze({
      registerShape: (provider: ShapeProvider) => collect(staged.shapes, () => copyShape(provider)),
      registerCommand: (command: Command) => collect(staged.commands, () => copyCommand(command)),
      registerDecorator: (decorator: TreeDecorator) => collect(staged.decorators, () => copyDecorator(decorator)),
      registerAttribute: (handler: AttributeHandler) => collect(staged.attributes, () => copyAttribute(handler)),
    });
    try {
      requireVoid(activate(context), "activation must be synchronous and return void");
      active = false;
      if (failed) throw failure;
      const next = { shapes: new Map(this.#state.shapes), selectors: new Map(this.#state.selectors),
        commands: new Map(this.#state.commands), decorators: new Map(this.#state.decorators), attributes: new Map(this.#state.attributes) };
      const add = <T>(category: string, map: Map<string, T>, name: string, value: T): void => {
        if (map.has(name)) throw new Error(`duplicate registration: ${category}/${name}`);
        map.set(name, value);
      };
      for (const provider of staged.shapes) {
        add("shapes", next.shapes, provider.kind, provider);
        const selector = selectorKey(provider.svg);
        if (next.selectors.has(selector)) throw new Error(`duplicate svg selector: ${selector}`);
        next.selectors.set(selector, provider);
      }
      for (const command of staged.commands) add("commands", next.commands, command.name, command);
      for (const decorator of staged.decorators) add("decorators", next.decorators, decorator.name, decorator);
      for (const handler of staged.attributes) add("attributes", next.attributes, handler.name, handler);
      const contributed = names({ shapes: new Map(staged.shapes.map(p => [p.kind, p])),
        commands: new Map(staged.commands.map(p => [p.name, p])), decorators: new Map(staged.decorators.map(p => [p.name, p])),
        attributes: new Map(staged.attributes.map(p => [p.name, p])) });
      if (validate) requireVoid(validate(contributed), "registration validation must be synchronous and return void");
      this.#state = next;
      return contributed;
    } finally { active = false; this.#registering = false; }
  }

  contributions(): ContributionNames { return names(this.#state); }
  shape(kind: string): ShapeProvider | undefined { return this.#state.shapes.get(kind); }
  command(name: string): Command | undefined { return this.#state.commands.get(name); }
  attribute(name: string): AttributeHandler | undefined { return this.#state.attributes.get(name); }

  /** Exact semantic selector first; unknown semantic values use only the same tag's base. */
  shapeForSvg(selector: SvgSelector): ShapeProvider | undefined {
    return this.#state.selectors.get(selectorKey(selector)) ?? this.#state.selectors.get(selectorKey({
      namespace: selector.namespace, localName: selector.localName,
    }));
  }

  shapeServices(): ShapeServices {
    const requireShape = (kind: string): ShapeProvider => {
      const provider = this.shape(kind);
      if (!provider) throw new Error(`unknown shape: ${kind}`);
      return provider;
    };
    const services: ShapeServices = Object.freeze<ShapeServices>({
      parseCreate: (kind, args) => requireShape(kind).parseCreate(args),
      create: (kind, id, parameters) => {
        const node = requireShape(kind).create(id, parameters, services);
        if (node.id !== id || node.kind !== kind) throw new Error("provider returned wrong shape identity");
        return node;
      },
      readAttribute: (node, name) => requireShape(node.kind).readAttribute(node, name),
    });
    return services;
  }

  treeTags(context: TreeDecorationContext): readonly string[] {
    const tags: string[] = [];
    const observation = Object.freeze({ document: context.document, saved: context.saved, node: context.node });
    for (const decorator of this.#state.decorators.values()) {
      const values = decorator.tags(observation);
      if (!Array.isArray(values)) {
        void Promise.resolve(values).catch(() => {});
        throw new Error("invalid tree tags");
      }
      if (!Array.from(values).every(tag => typeof tag === "string" && !/[\r\n]/.test(tag))) throw new Error("invalid tree tags");
      tags.push(...values.filter(tag => tag.length > 0));
    }
    return Object.freeze(tags);
  }

  selectAttribute(query: DocumentQuery, targetId: string, name: string): AttributeHandler | undefined {
    const document = queryView(query.view());
    const target = document.find(targetId);
    if (!target) throw new Error(`no such shape: ${targetId}`);
    const matches: AttributeHandler[] = [];
    for (const handler of this.#state.attributes.values()) {
      const match: unknown = handler.handles(Object.freeze({ document, target, name }));
      if (typeof match !== "boolean") { void Promise.resolve(match).catch(() => {}); throw new Error("attribute match must return a synchronous boolean"); }
      if (match) matches.push(handler);
    }
    if (matches.length > 1) throw new Error(`attribute handler conflict: ${targetId}/${name}`);
    return matches[0];
  }

  /** Generic transaction adapter only; the legacy CLI set path is deliberately not connected yet. */
  attributeAction(request: AttributeRequest): AttributeAction {
    const input = Object.freeze({ targetId: request.targetId, name: request.name, value: request.value });
    return Object.freeze<AttributeAction>({ execute: context => {
      const handler = this.selectAttribute(context, input.targetId, input.name);
      if (handler) requireVoid(handler.apply(context, input), "attribute apply must be synchronous and return void");
      else context.setDefault(input.targetId, input.name, input.value);
      return { operation: "set", targetIds: [input.targetId], parameters: { name: input.name, value: input.value },
        ...(handler?.describeOperation ? { feedbackOwner: { category: "attributes", name: handler.name } } : {}) };
    } });
  }
}
