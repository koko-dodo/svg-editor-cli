import * as fs from "node:fs/promises";
import { defaultRegistry, documentFactory } from "../../src/host/composition";
import { SvgDocument as CoreDocument } from "../../src/model/SvgDocument";
import { SvgReader as CoreReader } from "../../src/io/SvgReader";
import { SvgWriter as CoreWriter } from "../../src/io/SvgWriter";
import { SvgFileStore as CoreStore } from "../../src/io/SvgFileStore";
import { Editor as CoreEditor } from "../../src/services/Editor";
import { Formatter as CoreFormatter } from "../../src/cli/Formatter";
import { CommandCatalog as CoreCatalog } from "../../src/cli/CommandCatalog";
import { Repl as CoreRepl } from "../../src/cli/Repl";
import { Dispatcher as CoreDispatcher } from "../../src/cli/Dispatcher";
import type { CommitPreparer } from "../../src/commands/CommandHistory";
const registry = defaultRegistry();
export class SvgDocument extends CoreDocument { constructor(width = 800, height = 600) { super(width, height, id => registry.shapeServices().create("g", id, {}).asContainer()!); } }
export class SvgReader extends CoreReader { constructor() { super(registry, documentFactory(registry)); } }
export class SvgWriter extends CoreWriter { constructor() { super(registry); } }
export class SvgFileStore extends CoreStore { constructor(files: typeof fs = fs) { super(new SvgReader(), new SvgWriter(), files); } }
export class Editor extends CoreEditor { constructor(files: Pick<CoreStore, "read" | "save"> = new SvgFileStore(), preparer?: CommitPreparer) { super(defaultRegistry(), files, preparer, id => registry.shapeServices().create("g", id, {}).asContainer()!); } }
export class Formatter extends CoreFormatter { constructor() { super(registry, undefined, "g"); } }
export class CommandCatalog extends CoreCatalog { constructor() { super(registry); } }
export class Dispatcher extends CoreDispatcher { constructor(editor: CoreEditor, catalog: CoreCatalog, formatter = new Formatter()) { super(editor, catalog, formatter); } }
export class Repl extends CoreRepl { constructor(input: ConstructorParameters<typeof CoreRepl>[0], output: ConstructorParameters<typeof CoreRepl>[1], errors: ConstructorParameters<typeof CoreRepl>[2], interactive = false, editor: CoreEditor = new Editor()) { super(input, output, errors, interactive, editor); } }
