import { activate as activateShapes } from "../../plugins/builtin-shapes";
import { activate as activateCommands } from "../../plugins/builtin-commands";
import { ExtensionRegistry } from "../extensions/ExtensionRegistry";
import { SvgDocument } from "../model/SvgDocument";
import { SvgReader } from "../io/SvgReader";
import { SvgWriter } from "../io/SvgWriter";
import { SvgFileStore } from "../io/SvgFileStore";
import { Editor } from "../services/Editor";

/** Code composition only. Configuration/module loading belongs to the next stage. */
export function defaultRegistry(): ExtensionRegistry {
  const registry = new ExtensionRegistry();
  registry.register(context => {
    activateShapes(context);
    activateCommands(context);
  });
  return registry;
}

/** The ordinary grouping policy is selected here, never in the domain kernel. */
function groupFactory(registry: ExtensionRegistry) {
  return (id: string) => {
    const shape = registry.shapeServices().create("g", id, {});
    const container = shape.asContainer();
    if (!container) throw new Error("default group provider must create a container");
    return container;
  };
}

export function documentFactory(registry: ExtensionRegistry) {
  const makeGroup = groupFactory(registry);
  return (width = 800, height = 600) => new SvgDocument(width, height, makeGroup);
}

export function fileStore(registry: ExtensionRegistry) {
  return new SvgFileStore(new SvgReader(registry, documentFactory(registry)), new SvgWriter(registry));
}

export function createEditor(registry = defaultRegistry()) {
  return new Editor(registry, fileStore(registry), undefined, groupFactory(registry));
}
