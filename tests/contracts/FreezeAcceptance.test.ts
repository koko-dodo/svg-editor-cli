import * as fs from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import type { DocumentView, ShapeView, TreeDecorationContext } from "../../src/api";
import { defaultRegistry, createEditor } from "../../src/host/composition";
import { CommandCatalog } from "../../src/cli/CommandCatalog";
import { Dispatcher } from "../../src/cli/Dispatcher";
import { Formatter } from "../../src/cli/Formatter";
import { Parser } from "../../src/cli/Parser";
import { PairProvider, PairAttributes } from "../support/FreezeProbes";
import { CallbackCommand, ObservationDecorator } from "../support/WiredExtensions";
const directories:string[]=[];
afterEach(async()=>{for(const path of directories.splice(0))await fs.rm(path,{recursive:true,force:true});});
async function directory(){const result=await fs.mkdtemp(join(tmpdir(),"svg-freeze-"));directories.push(result);return result;}
function fixture(){
 const registry=defaultRegistry();registry.register(c=>{c.registerShape(new PairProvider());c.registerAttribute(new PairAttributes());});
 const editor=createEditor(registry),catalog=new CommandCatalog(registry),formatter=new Formatter(registry,()=>editor.observation()),parser=new Parser(catalog),dispatcher=new Dispatcher(editor,catalog,formatter);
 return {registry,editor,run:(line:string)=>dispatcher.execute(parser.parse(line)!),state:()=>({view:editor.tree(),status:editor.getStatus(),observation:editor.observation()})};
}
function content(node:ShapeView):unknown{return {id:node.id,kind:node.kind,parentId:node.parentId,attributes:Object.entries(node.attributes).sort(([a],[b])=>a<b?-1:a>b?1:0),children:node.children.map(content)};}
function rootContent(doc:DocumentView):unknown{return {width:doc.width,height:doc.height,roots:doc.roots.map(content)};}
function difference(context:TreeDecorationContext):boolean {
 if(context.saved===null)return true;
 if(context.node===null)return JSON.stringify(rootContent(context.document))!==JSON.stringify(rootContent(context.saved));
 const find=(nodes:readonly ShapeView[]):ShapeView|undefined=>{for(const n of nodes){if(n.id===context.node!.id)return n;const found=find(n.children);if(found)return found;}return undefined;};
 const saved=find(context.saved.roots);return !saved||JSON.stringify(content(context.node))!==JSON.stringify(content(saved));
}

it("creates two required built-in parts via public services, nests them, and prepares semantic feedback through undo/redo",()=>{
 const f=fixture();f.run("init");expect(f.run('create audit-pair a 1 2 3 4 "first"')).toEqual(["pair create execute"]);
 f.run('create audit-pair b 10 20 30 40 "second" in a');f.run("create g scene");f.run("addto scene a");f.run("move a 5 6");
 expect(f.editor.tree("b-caption").attributes).toMatchObject({x:15,y:26,text:"second"});
 expect(f.run('set a caption "changed"')).toEqual(['pair caption execute "changed"']);expect(f.run("undo")).toEqual(['pair caption undo "first"']);expect(f.run("redo")).toEqual(['pair caption redo "changed"']);
 expect(f.run("set a tone red")).toEqual(['pair tone execute "red"']);expect(f.editor.tree("a-surface").attributes.fill).toBe("red");
 expect(f.editor.tree("a").attributes.fill).toBeUndefined();
 const beforeScale=f.editor.tree();f.run("scale a 2");expect(f.editor.tree("b-caption").attributes.x).toBe(30);f.run("undo");expect(f.editor.tree()).toEqual(beforeScale);
});
it("rejects operations removing either required part, but permits grouping the complete subtree and deleting it atomically",()=>{
 const f=fixture();f.run("init");f.run('create audit-pair a 1 2 3 4 "first"');f.run("create g destination");
 const before=f.state();for(const text of ["delete a-caption","addto destination a-surface","group displaced a-caption","ungroup a"]){expect(()=>f.run(text)).toThrow();expect(f.state()).toEqual(before);}
 f.run("group wrapper a destination");expect(f.editor.tree("a").kind).toBe("audit-pair");f.run("delete a");expect(()=>f.editor.tree("a-caption")).toThrow();f.run("undo");expect(f.editor.tree("a").kind).toBe("audit-pair");
});
it("round-trips both built-in parts and nested semantic kinds, downgrades without the provider and rejects recognized invalid reads",async()=>{
 const f=fixture(),path=join(await directory(),"pair.svg");f.run("init");f.run('create audit-pair a 1 2 3 4 "中文 😀"');f.run('create audit-pair b 2 3 4 5 "nested" in a');
 await f.editor.save(path);const original=f.editor.tree();await f.editor.read(path);expect(f.editor.tree()).toEqual(original);
 const absent=createEditor();await absent.read(path);expect(absent.tree("a").kind).toBe("g");expect(absent.tree("b").kind).toBe("g");
 const bad=join(await directory(),"bad.svg");await fs.writeFile(bad,'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><g id="x" data-kind="audit-pair"><g id="x-surface"/><text id="x-caption" x="0" y="0">wrong</text></g></svg>');
 const before=f.state();await expect(f.editor.read(bad)).rejects.toThrow("invalid pair parts");expect(f.state()).toEqual(before);
});
it("supports read-only DFS and an injected async adapter with no document and without changing undo/redo on success or failure",async()=>{
 const f=fixture();let fail=false,visits=0;
 const adapter={async list(){if(fail)throw new Error("adapter failed");return ["injected"]}};
 f.registry.register(c=>{
  c.registerCommand(new CallbackCommand("adapter-probe",()=>({mode:"query",execute:async()=>({stdout:await adapter.list(),stderr:[]})})));
  c.registerCommand(new CallbackCommand("dfs-probe",()=>({mode:"query",execute:p=>{const result:string[]=[];const walk=(nodes:readonly ShapeView[])=>{for(const node of nodes){visits++;result.push(`${node.kind}:${node.container}`);walk(node.children)}};walk(p.document!.view().roots);return {stdout:result,stderr:[]}}})));
 });
 expect(await f.run("adapter-probe")).toEqual({stdout:["injected"],stderr:[]});f.run("init");f.run('create audit-pair a 1 2 3 4 "caption"');f.run("move a 1 0");f.run("undo");const before=f.state();
 expect(f.run("dfs-probe")).toEqual(["audit-pair:true","rect:false","text:false"]);expect(visits).toBe(3);await f.run("adapter-probe");expect(f.state()).toEqual(before);
 fail=true;await expect(f.run("adapter-probe")).rejects.toThrow("adapter failed");expect(f.state()).toEqual(before);
});
it("supplies enough immutable content for saved-point comparison, ancestor propagation, same-value edits and ordered decorators",async()=>{
 const f=fixture(),observer=new ObservationDecorator("one"),second=new ObservationDecorator("two");f.registry.register(c=>{c.registerDecorator(observer);c.registerDecorator(second);});
 const changes=()=>{observer.observations.length=0;const output=f.run("tree");return {output,flags:observer.observations.map(c=>[c.node?.id??"svg",difference(c)])};};
 f.run("init");expect(changes().flags).toEqual([["svg",true]]);f.run('create audit-pair a 1 2 3 4 "caption"');const path=join(await directory(),"point.svg");await f.editor.save(path);expect(changes().flags.every(([,changed])=>!changed)).toBe(true);
 f.run('set a caption "caption"');expect(changes().flags.every(([,changed])=>!changed)).toBe(true);
 f.run('set a caption "new"');expect(changes().flags).toContainEqual(["a",true]);expect(changes().flags).toContainEqual(["svg",true]);f.run("undo");expect(changes().flags.every(([,changed])=>!changed)).toBe(true);f.run("redo");expect(changes().flags).toContainEqual(["a-caption",true]);
 await f.editor.read(path);f.run("create circle extra 1 2 3 in a");expect(changes().flags).toContainEqual(["extra",true]);f.run("undo");expect(changes().flags.every(([,changed])=>!changed)).toBe(true);
 f.run("front a-surface");expect(changes().flags).toContainEqual(["a",true]);f.run("undo");expect(changes().flags.every(([,changed])=>!changed)).toBe(true);
 f.run("create circle stable 1 2 3 in a");f.run("create g destination");await f.editor.save(path);
 f.run("addto destination stable");expect(changes().flags).toContainEqual(["stable",true]);expect(changes().flags).toContainEqual(["a",true]);expect(changes().flags).toContainEqual(["destination",true]);f.run("undo");expect(changes().flags.every(([,changed])=>!changed)).toBe(true);
 f.run("delete stable");expect(changes().flags).toContainEqual(["a",true]);f.run("undo");expect(changes().flags.every(([,changed])=>!changed)).toBe(true);
 expect((changes().output as string[]).every(line=>line.endsWith(" one two"))).toBe(true);
 const other=createEditor(f.registry);other.init();expect(other.observation().saved).toBeNull();expect(f.editor.observation().saved).not.toBeNull();
});

it("rejects a collision in the second generated part without leaving the first part or parent",()=>{
 const f=fixture();f.run("init");f.run('create text clash-caption 0 0 "existing"');const before=f.state();
 expect(()=>f.run('create audit-pair clash 1 2 3 4 "new"')).toThrow("id already exists: clash-caption");expect(f.state()).toEqual(before);
 expect(()=>f.editor.tree("clash-surface")).toThrow("no such shape");
});
