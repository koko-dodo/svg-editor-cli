import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PluginInstaller } from "./loading/PluginInstaller";
import * as shapePlugin from "../../plugins/builtin-shapes";
import * as commandPlugin from "../../plugins/builtin-commands";
import * as statsPlugin from "../../plugins/command-stats";
import * as dirPlugin from "../../plugins/command-dir";
import * as boxPlugin from "../../plugins/shape-box";
import * as starPlugin from "../../plugins/tree-star";
import { ExtensionRegistry } from "../extensions/ExtensionRegistry";
import { SvgDocument } from "../model/SvgDocument";
import { SvgReader } from "../io/SvgReader";
import { SvgWriter } from "../io/SvgWriter";
import { SvgFileStore } from "../io/SvgFileStore";
import { Editor } from "../services/Editor";

/** Default module selection belongs exclusively to this composition root. */
export function defaultRegistry(): ExtensionRegistry {
  const registry = new ExtensionRegistry();
  const installer = new PluginInstaller(registry);
  for (const [directory, plugin] of [["builtin-shapes", shapePlugin], ["builtin-commands", commandPlugin]] as const) {
    const metadata: unknown = JSON.parse(readFileSync(join(__dirname, "../../plugins", directory, "package.json"), "utf8"));
    const error = installer.install(directory, metadata, plugin);
    if (error) throw new Error(error);
  }
  const errors = installer.installCode([
    { module: "./plugins/command-stats", manifest: JSON.parse(readFileSync(join(__dirname, "../../plugins/command-stats/package.json"), "utf8")), exports: statsPlugin, options: {} },
    { module: "./plugins/command-dir", manifest: JSON.parse(readFileSync(join(__dirname, "../../plugins/command-dir/package.json"), "utf8")), exports: dirPlugin, options: {} },
    { module: "./plugins/shape-box", manifest: JSON.parse(readFileSync(join(__dirname, "../../plugins/shape-box/package.json"), "utf8")), exports: boxPlugin, options: {} },
    { module: "./plugins/tree-star", manifest: JSON.parse(readFileSync(join(__dirname, "../../plugins/tree-star/package.json"), "utf8")), exports: starPlugin, options: {} },
  ]);
  if (errors.length) throw new Error(errors.join("\n"));
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
