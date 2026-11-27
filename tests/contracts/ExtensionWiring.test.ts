import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AttributeMutation, HostOperations, MutationPort, ShapeView } from "../../src/api";
import { defaultRegistry, createEditor, documentFactory } from "../../src/host/composition";
import { CommandCatalog } from "../../src/cli/CommandCatalog";
import { Dispatcher } from "../../src/cli/Dispatcher";
import { Formatter } from "../../src/cli/Formatter";
import { Parser } from "../../src/cli/Parser";
import { SvgReader } from "../../src/io/SvgReader";
import { SvgWriter } from "../../src/io/SvgWriter";
import { Editor } from "../../src/services/Editor";
import { ProbeAttribute, ProbeDecorator, ProbeQueryCommand } from "../support/RegistryExtensions";
import { CallbackCommand, FeedbackLeafProvider, ObservationDecorator, RequiredProvider, edited } from "../support/WiredExtensions";

function fixture(provider = new FeedbackLeafProvider()) {
  const registry = defaultRegistry(); registry.register(c => c.registerShape(provider));
  const editor = createEditor(registry), catalog = new CommandCatalog(registry);
  const formatter = new Formatter(registry, () => editor.observation());
  const parser = new Parser(catalog), dispatcher = new Dispatcher(editor,catalog,formatter);
  const run = (text: string) => dispatcher.execute(parser.parse(text)!);
  const state = () => ({ view: editor.tree(), status: editor.getStatus(), observation: editor.observation() });
  return { registry, editor, formatter, parser, run, state, provider };
}
const directories: string[] = [];
async function temporary() { const path=await fs.mkdtemp(join(tmpdir(),"svg-wiring-")); directories.push(path);return path; }
afterEach(async () => { await Promise.all(directories.splice(0).map(path => fs.rm(path,{recursive:true,force:true}))); });

const xml = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">${body}</svg>`;
const probe = (id: string, value=1) => `<probe xmlns="urn:test:svg" id="${id}" value="${value}"/>`;

describe("real shape and command wiring", () => {
  it("constructs, displays, transforms and round-trips a new semantic kind through unmodified default commands", () => {
    const f=fixture();f.run("init");
    expect(f.run("create probe-leaf p 4")).toEqual(["shape create execute"]);
    expect(f.run("show p")).toEqual(["probe#p  parent=svg","  value=4"]);
    expect(f.run("tree")).toEqual(["svg (800x600)","└── probe#p  v=4"]);
    expect(f.run("move p 2 3")).toEqual(["shape move execute"]);
    const writer = new SvgWriter(f.registry), reader = new SvgReader(f.registry,documentFactory(f.registry));
    const result=writer.write(reader.read(xml(probe("p",9))).document);
    expect(result.xml).toContain('xmlns="urn:test:svg"');
    expect(reader.read(result.xml).document.view().roots[0]?.attributes.value).toBe(9);
  });
  it("uses exact semantic selectors, reserves named IDs before assigning unnamed IDs and downgrades unknown semantics", () => {
    const f=fixture(),reader=new SvgReader(f.registry,documentFactory(f.registry));
    f.registry.register(c=>c.registerShape(new RequiredProvider()));
    const loaded=reader.read(xml(`<g data-kind="uninstalled"><g/><g id="g1"/></g>`));
    expect(loaded.document.view().roots[0]?.kind).toBe("g");
    expect(loaded.warnings.map(w=>w.id)).toEqual(["g2","g3"]);
    expect(()=>reader.read(xml('<g data-kind="required-parts" id="c"/>'))).toThrow("required part is invalid");
    expect(()=>reader.read(xml('<probe xmlns="urn:wrong" id="p"/>'))).toThrow("unsupported SVG namespace");
  });
  it("supports composite subtrees, nesting, group adoption and required-part protections", () => {
    const f=fixture(); f.registry.register(c=>c.registerShape(new RequiredProvider()));f.run("init");
    f.run("create g outer");f.run("create required-parts c");f.run("create probe-leaf p 5");f.run("group combined c p");
    f.run("addto c outer");f.run("move c 1 2");
    expect(f.editor.tree("c-part").attributes.value).toBe(4);
    const before=f.state();
    for(const command of ["delete c-part","addto outer c-part","ungroup c","create probe-leaf c-part 1"]) {
      expect(()=>f.run(command)).toThrow();expect(f.state()).toEqual(before);
    }
    const reader = new SvgReader(f.registry,documentFactory(f.registry));
    const encoded=xml(`<g id="c" data-kind="required-parts">${probe("c-part")}<g id="nested" data-kind="required-parts">${probe("nested-part")}</g></g>`);
    const loaded=reader.read(encoded);
    const serialized = new SvgWriter(f.registry).write(loaded.document);
    expect(reader.read(serialized.xml).document.view()).toEqual(loaded.document.view());
    expect(loaded.document.view().roots[0]?.children[1]?.kind).toBe("required-parts");
    const absent=fixture(),fallback=new SvgReader(absent.registry,documentFactory(absent.registry)).read(serialized.xml).document.view();
    expect(fallback.roots[0]?.kind).toBe("g");expect(fallback.roots[0]?.children[1]?.kind).toBe("g");
  });
  it("rejects generated descendant ID collisions before publishing any subtree", () => {
    const f=fixture();f.registry.register(c=>c.registerShape(new RequiredProvider()));f.run("init");f.run("create probe-leaf c-part 1");const before=f.state();
    expect(()=>f.run("create required-parts c")).toThrow("id already exists: c-part");expect(f.state()).toEqual(before);
  });
  it("keeps parsed observation values frozen and separate from execution arguments", () => {
    const f=fixture();f.run("init");const request=f.parser.parse("create rect r 1 2 3 4")!;
    expect(Object.isFrozen(request.request)).toBe(true);
    expect(()=>{(request.request as Record<string,unknown>).id="changed";}).toThrow();
    const dispatcher=new Dispatcher(f.editor,new CommandCatalog(f.registry),f.formatter);
    expect(()=>dispatcher.execute(request)).toThrow("unknown command invocation");
  });
  it("rejects a provider that changes descendant read content", () => {
    class TamperingProvider extends RequiredProvider {
      override read(element: Parameters<RequiredProvider["read"]>[0], id: string, children: Parameters<RequiredProvider["read"]>[2]) {
        children[0]!.move(100,0);return super.read(element,id,children);
      }
    }
    const f=fixture();f.registry.register(c=>c.registerShape(new TamperingProvider()));
    expect(()=>new SvgReader(f.registry,documentFactory(f.registry)).read(xml(`<g id="c" data-kind="required-parts">${probe("c-part")}</g>`))).toThrow("provider changed read children");
  });
  it("validates and snapshots declarative SVG read policy during atomic registration", () => {
    const f=fixture(), attributes=["id"];
    class PolicyProvider extends RequiredProvider { readonly readPolicy={attributes,text:false,children:true}; }
    f.registry.register(c=>c.registerShape(new PolicyProvider()));attributes.push("unexpected");
    expect(f.registry.shape("required-parts")?.readPolicy?.attributes).toEqual(["id"]);
    const invalid=new RequiredProvider() as RequiredProvider & {readPolicy:unknown};invalid.readPolicy={attributes:["id"],text:"false",children:true};
    const before=f.registry.contributions();expect(()=>f.registry.register(c=>c.registerShape(invalid as unknown as PolicyProvider))).toThrow("invalid svg read policy");expect(f.registry.contributions()).toEqual(before);
  });
  it("rejects wrong serialized identity", () => {
    class WrongWriter extends FeedbackLeafProvider { override write(node:ShapeView) { return {...super.write(node), attributes:{id:"wrong",value:"1"}}; } }
    const f=fixture(new WrongWriter()), doc=documentFactory(f.registry)();doc.addShape(f.registry.shapeServices().create("probe-leaf","p",{value:1}));
    expect(()=>new SvgWriter(f.registry).write(doc)).toThrow("provider changed write identity");
  });
  it("queries through the public path without an init requirement or a history entry", async () => {
    const f=fixture();f.registry.register(c=>c.registerCommand(new ProbeQueryCommand()));
    expect(f.run("inspect-probe")).toEqual(["none"]);f.run("init");f.run("create probe-leaf p 1");const before=f.state();
    expect(f.run("inspect-probe")).toEqual(["1"]);expect(f.state()).toEqual(before);
    expect(await f.run("help")).toContain("inspect-probe");
  });
  it("uses the actual custom command identity for feedback and never reexecutes its edit during undo/redo", () => {
    const f=fixture();f.provider.enabled=false;let executions=0;let retained:MutationPort|undefined;
    f.registry.register(c=>c.registerCommand(new CallbackCommand("nudge",()=>({mode:"edit",execute:context=>{
      executions++;retained=context.document;context.document.move("p",1,0);return edited("p");
    }}))));f.run("init");f.run("create probe-leaf p 1");
    expect(f.run("nudge")).toEqual(["command nudge execute"]);
    expect(()=>retained!.move("p",9,0)).toThrow("expired");
    expect(f.run("undo")).toEqual(["command nudge undo"]);expect(f.run("redo")).toEqual(["command nudge redo"]);expect(executions).toBe(1);
  });
  it("grants exactly one host operation and expires retained capabilities", () => {
    const f=fixture();let retained:Pick<HostOperations,"canvas">|undefined;
    f.registry.register(c=>c.registerCommand(new CallbackCommand("inspect-canvas",()=>({mode:"host",capability:"canvas",execute:p=>{
      retained=p;expect(Object.keys(p)).toEqual(["canvas"]);return {stdout:[String(p.canvas().width)],stderr:[]};
    }}))));f.run("init");const before=f.state();expect(f.run("inspect-canvas")).toEqual(["800"]);expect(f.state()).toEqual(before);
    expect(()=>retained!.canvas()).toThrow("expired");
  });
});

describe("attribute and feedback transactions", () => {
  it("runs the real set fallback, single match and combined edits in one history unit", () => {
    const f=fixture();f.registry.register(c=>c.registerAttribute(new ProbeAttribute()));f.run("init");f.run("create probe-leaf p 1");
    expect(f.run("set p pair 6")).toEqual(["pair execute"]);expect(f.editor.tree("p").attributes).toMatchObject({value:6,"stroke-width":6});
    expect(f.run("undo")).toEqual(["pair undo"]);expect(f.editor.tree("p").attributes.value).toBe(1);f.run("redo");
    expect(f.run("set p value 7")).toEqual(["shape set execute"]);
    const before=f.state();expect(()=>f.run("set p missing 1")).toThrow("unknown attribute: missing");expect(f.state()).toEqual(before);
  });
  it.each(["apply","conflict"])("rolls back %s failure without falling back", failure => {
    const f=fixture();f.registry.register(c=>{c.registerAttribute(new ProbeAttribute("first",failure==="apply"));if(failure==="conflict")c.registerAttribute(new ProbeAttribute("second"));});
    f.run("init");f.run("create probe-leaf p 1");const before=f.state();
    expect(()=>f.run("set p pair 8")).toThrow(failure==="apply"?"probe apply failed":"attribute handler conflict");expect(f.state()).toEqual(before);
  });
  it("expires a retained narrow attribute port after successful and failed set", () => {
    const f=fixture();let port:AttributeMutation|undefined;let fail=false;
    f.registry.register(c=>c.registerAttribute({name:"retaining",handles:()=>true,apply:p=>{port=p;p.setDefault("p","value",2);if(fail)throw new Error("failed");}}));
    f.run("init");f.run("create probe-leaf p 1");f.run("set p value 2");expect(Object.keys(port!)).not.toContain("deleteShape");expect(()=>port!.setDefault("p","value",9)).toThrow("expired");
    fail=true;const before=f.state();expect(()=>f.run("set p value 3")).toThrow("failed");expect(()=>port!.find("p")).toThrow("expired");expect(f.state()).toEqual(before);
  });
  it("allows multiple handler invocations in a single edit plan with one undo", () => {
    const f=fixture();f.registry.register(c=>{c.registerAttribute(new ProbeAttribute());c.registerCommand(new CallbackCommand("twice",()=>({mode:"edit",execute:p=>{
      p.setAttribute({targetId:"p",name:"pair",value:3});return p.setAttribute({targetId:"p",name:"pair",value:4});
    }})));});f.run("init");f.run("create probe-leaf p 1");f.run("twice");expect(f.editor.tree("p").attributes.value).toBe(4);f.run("undo");expect(f.editor.tree("p").attributes).toEqual({value:1});
  });
  it.each(["execute","undo","redo"])("prepares real shape feedback before %s commits", direction => {
    const f=fixture();f.run("init");f.run("create probe-leaf p 1");f.run("move p 1 0");if(direction==="redo")f.run("undo");
    f.provider.fail=direction;const before=f.state();expect(()=>f.run(direction==="execute"?"move p 2 0":direction)).toThrow("feedback failed");expect(f.state()).toEqual(before);
    f.provider.fail=undefined;f.run(direction==="execute"?"move p 2 0":direction);
  });
  it("consults an explicit shape feedback owner once before the default command fallback", () => {
    const f=fixture();f.provider.enabled=false;f.run("init");f.run("create probe-leaf p 1");f.provider.calls=[];
    const result=f.editor.executeAction({execute:p=>{p.move("p",1,0);return {...edited("p"),feedbackOwner:{category:"shapes",name:"probe-leaf"}};}});
    expect(result.preparedFeedback).toEqual(["probe#p moved by (1,0)"]);expect(f.provider.calls).toEqual(["execute"]);
  });
  it("prepares custom command fallback feedback before committing", () => {
    const f=fixture();f.provider.enabled=false;
    const command=new CallbackCommand("bad-command",()=>({mode:"edit",execute:p=>{p.document.move("p",1,0);return edited("p");}}));
    command.describeOperation=()=>{throw new Error("command feedback failed");};f.registry.register(c=>c.registerCommand(command));
    f.run("init");f.run("create probe-leaf p 1");const before=f.state();expect(()=>f.run("bad-command")).toThrow("command feedback failed");expect(f.state()).toEqual(before);
  });
  it("rejects async edit plans and expires their retained port on the real CLI path", async () => {
    const f=fixture();let retained:MutationPort|undefined;
    f.registry.register(c=>c.registerCommand(new CallbackCommand("async-edit",()=>({mode:"edit",execute:p=>{
      retained=p.document;p.document.move("p",1,0);return Promise.reject(new Error("late failure")) as unknown as ReturnType<typeof edited>;
    }}))));f.run("init");f.run("create probe-leaf p 1");const before=f.state();expect(()=>f.run("async-edit")).toThrow("editing action must be synchronous");
    await Promise.resolve();expect(()=>retained!.move("p",1,0)).toThrow("expired");expect(f.state()).toEqual(before);
  });
  it("prepares handler feedback before mutation commit", () => {
    const f=fixture();f.registry.register(c=>c.registerAttribute({name:"bad-feedback",handles:()=>true,apply:p=>{p.setDefault("p","value",8);},describeOperation:()=>{throw new Error("handler feedback");}}));
    f.run("init");f.run("create probe-leaf p 1");const before=f.state();expect(()=>f.run("set p value 8")).toThrow("handler feedback");expect(f.state()).toEqual(before);
  });
  it("rejects raw multiline plugin feedback while preserving escaped Phase 1 text and ID feedback", () => {
    const f=fixture();f.run("init");f.run("create probe-leaf p 1");f.provider.rawLine="bad\nline";const before=f.state();expect(()=>f.run("move p 1 0")).toThrow("invalid prepared feedback");expect(f.state()).toEqual(before);
    f.editor.create({type:"text",id:"t\n",x:1,y:2,text:"first\r\nsecond"});
    expect(f.editor.setAttribute("t\n","text","third\r\nfourth").preparedFeedback).toEqual(['text#t\\n updated: text="third\\r\\nfourth"']);
    expect(f.editor.undo().feedback).toEqual(['text#t\\n updated: text="first\\r\\nsecond"']);
  });
});

describe("tree observation and IO save baseline", () => {
  it("composes decorators in registry order on the real tree, including root and subtree rendering", () => {
    const f=fixture(), observer=new ObservationDecorator("first");f.registry.register(c=>{c.registerDecorator(observer);c.registerDecorator(new ProbeDecorator("second","second"));});f.run("init");f.run("create g g");f.run("create rect r 1 2 3 4 in g");
    expect(f.run("tree")).toEqual(["svg (800x600) first second","└── g#g first second","    └── rect#r  x=1 y=2 w=3 h=4 first second"]);
    expect(f.run("tree g")).toEqual(["g#g first second","└── rect#r  x=1 y=2 w=3 h=4 first second"]);
    const observation=observer.observations.at(-1)!;expect(observation.document.roots[0]?.id).toBe("g");expect(observation.saved).toBeNull();
    expect(Object.isFrozen(observation.document.roots[0]?.children)).toBe(true);expect(()=>{(observation.node!.attributes as Record<string,string>).x="changed";}).toThrow();
  });
  it("provides content comparison through init, save, edit, undo to savepoint, redo and IO barriers", async () => {
    const f=fixture(),path=join(await temporary(),"saved.svg");f.run("init");expect(f.editor.observation().saved).toBeNull();f.run("create g g");f.run("create rect r 1 2 3 4 in g");await f.editor.save(path);
    const saved=f.editor.observation().saved;expect(saved).toEqual(f.editor.tree());expect(()=>f.run("undo")).toThrow("undo not allowed after io command");
    f.run("move r 2 0");expect(f.editor.observation().saved).toBe(saved);expect(f.editor.tree()).not.toEqual(saved);expect(f.editor.tree("g")).not.toEqual(saved?.roots[0]);
    f.run("undo");expect(f.editor.tree()).toEqual(saved);f.run("redo");expect(f.editor.tree()).not.toEqual(saved);await f.editor.read(path);expect(f.editor.observation().saved).toEqual(f.editor.tree());
    f.run("canvas 200 300");expect(f.editor.observation().saved).not.toEqual(f.editor.tree());expect(()=>f.run("undo")).toThrow("io command");f.run("init");expect(f.editor.observation().saved).toBeNull();
  });
  it.each([
    '<g id="c" data-kind="required-parts"/>',
    '<g id="c" data-kind="required-parts"><g id="c-part"/></g>',
    '<g id="c" data-kind="required-parts"><g id="c-part"/><g id="c-part"/></g>',
  ])("rejects recognized malformed composites without downgrading or replacing the active document: %s", async body => {
    const f=fixture();f.registry.register(c=>c.registerShape(new RequiredProvider()));const dir=await temporary(),path=join(dir,"bad.svg");await fs.writeFile(path,xml(body));
    f.run("init");f.run("create probe-leaf p 1");const before=f.state();await expect(f.editor.read(path)).rejects.toThrow();expect(f.state()).toEqual(before);
  });
  it("preserves document, baseline, history and default path on rejected read/save", async () => {
    const f=fixture();f.registry.register(c=>c.registerShape(new RequiredProvider()));const dir=await temporary(),valid=join(dir,"valid.svg"),bad=join(dir,"bad.svg");await fs.writeFile(valid,xml(probe("p")));await fs.writeFile(bad,xml('<g id="c" data-kind="required-parts"/>'));
    await f.editor.read(valid);f.run("move p 1 0");const before=f.state();await expect(f.editor.read(bad)).rejects.toThrow("required part");expect(f.state()).toEqual(before);
    await expect(f.editor.save(join(dir,"absent","output.svg"))).rejects.toThrow("cannot write file");expect(f.state()).toEqual(before);await f.editor.save();expect(await fs.readFile(valid,"utf8")).toContain('value="2"');
  });
});
