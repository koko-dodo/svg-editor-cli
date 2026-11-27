import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { Shape } from "../../src/api";
import type { Attributes, ShapeServices } from "../../src/api";
import { Box } from "../../plugins/shape-box/Box";
import { BoxProvider } from "../../plugins/shape-box/BoxProvider";
import * as boxPlugin from "../../plugins/shape-box";
import { defaultRegistry, createEditor } from "../../src/host/composition";
import { PluginInstaller } from "../../src/host/loading/PluginInstaller";
import { CommandCatalog } from "../../src/cli/CommandCatalog";
import { Parser } from "../../src/cli/Parser";
import { Dispatcher } from "../../src/cli/Dispatcher";
import { Formatter } from "../../src/cli/Formatter";
const paths:string[]=[];
afterEach(async()=>{for(const path of paths.splice(0))await fs.rm(path,{recursive:true,force:true});});
async function directory(){const path=await fs.mkdtemp(join(tmpdir(),"svg-box-"));paths.push(path);return path;}
function fixture(){
 const registry=defaultRegistry();const error=new PluginInstaller(registry).install("box",{name:"box",contributes:{shapes:["box"],attributes:["box-attributes"],decorators:["box-type-label"]}},boxPlugin);if(error)throw new Error(error);
 const editor=createEditor(registry),catalog=new CommandCatalog(registry),parser=new Parser(catalog),dispatch=new Dispatcher(editor,catalog,new Formatter(registry,()=>editor.observation()));
 return {registry,editor,run:(line:string)=>dispatch.execute(parser.parse(line)!),state:()=>({view:editor.tree(),status:editor.getStatus(),observation:editor.observation()})};
}
// Provider isolation: no concrete built-in model or plugin imports in this double.
class Leaf extends Shape {
 constructor(id:string,readonly kind:string,private values:Record<string,string|number>){super(id);}
 override attributes():Attributes{return {...this.values,...super.attributes()};}
 move(dx:number,dy:number){this.values.x=Number(this.values.x)+dx;this.values.y=Number(this.values.y)+dy;}
 scale(factor:number){for(const key of ["x","y","width","height"])if(this.values[key]!==undefined)this.values[key]=Number(this.values[key])*factor;}
 protected setOwnAttribute(name:string,value:string|number){this.values[name]=value;}
 clone(){return new Leaf(this.id,this.kind,{...this.attributes()});}
}
it("constructs and clones independently using only ShapeServices and preserves part ownership",()=>{
 const provider=new BoxProvider();const services:ShapeServices={create:(kind,id,a)=>new Leaf(id,kind,{...a}),parseCreate:()=>({parameters:{}}),createHelp:()=>[],readAttribute:(n,k)=>n.attributes[k],present:()=>({tag:"g",summary:"",position:null,geometry:[],styles:[]})};
 const created=provider.create("b",{x:120,y:100,width:160,height:60,label:"开始"},services),copy=created.clone();
 expect(copy).toBeInstanceOf(Box);expect(copy.children.map(n=>[n.id,n.kind])).toEqual([["b-rect","rect"],["b-label","text"]]);copy.move(5,6);
 expect(created.children[1]!.attributes()).toMatchObject({x:140,y:135,text:"开始"});expect(copy.children[1]!.attributes()).toMatchObject({x:145,y:141});expect(copy.children[0]).not.toBe(created.children[0]);
});
it("parses optional in, quoted in titles and rejects invalid syntax/numeric input",()=>{
 const f=fixture();f.run("init");f.run("create g parent");f.run('create box n 1 2 3 4 "in" in parent');expect(f.editor.tree("n").parentId).toBe("parent");
 const before=f.state();for(const text of ['create box b 1 2 3 4','create box b bad 2 3 4 title','create box b 1 2 -3 4 title','create box b 1 2 3 4 title "in" parent']){expect(()=>f.run(text)).toThrow();expect(f.state()).toEqual(before);}
});
it("moves/scales nested descendants once, supports grouping and whole deletion with undo/redo",()=>{
 const f=fixture();f.run("init");f.run('create box a 1 2 3 4 "A"');f.run('create box b 10 20 30 40 "B" in a');f.run("create g other");f.run("group cluster a other");
 f.run("move a 5 6");expect(f.editor.tree("b-label").attributes).toMatchObject({x:35,y:61});const beforeScale=f.editor.tree();f.run("scale a 2");expect(f.editor.tree("b-rect").attributes).toMatchObject({x:30,y:52,width:60,height:80});f.run("undo");expect(f.editor.tree()).toEqual(beforeScale);f.run("redo");
 const beforeDelete=f.editor.tree();expect(f.run("delete a")).toEqual(["box#a deleted"]);f.run("undo");expect(f.editor.tree()).toEqual(beforeDelete);f.run("redo");expect(()=>f.editor.tree("b-label")).toThrow();
});
it("propagates fill and label with one undo unit each and exact undo/redo feedback",()=>{
 const f=fixture();f.run("init");f.run('create box a 1 2 3 4 "old"');expect(f.run("set a fill red")).toEqual(["box#a fill propagated to a-rect"]);expect(f.editor.tree("a").attributes.fill).toBeUndefined();
 expect(f.editor.tree("a-rect").attributes.fill).toBe("red");f.run("undo");expect(f.editor.tree("a-rect").attributes.fill).toBe("#4a90d9");f.run("redo");
 expect(f.run('set a label "new"')).toEqual(['box#a label updated: "new"']);expect(f.run("undo")).toEqual(['box#a label restored: "old"']);expect(f.run("redo")).toEqual(['box#a label updated: "new"']);
 const before=f.state();expect(()=>f.run("set a fill url(bad)")).toThrow();expect(f.state()).toEqual(before);
});
it("rejects partial handler failure, handler conflicts and feedback failure without changing document/history",()=>{
 const f=fixture();f.run("init");f.run('create box a 1 2 3 4 "old"');
 f.registry.register(c=>c.registerAttribute({name:"failure",handles:q=>q.target.kind==="box"&&q.name==="fail",apply:p=>{p.setDefault("a-label","text","changed");throw new Error("partial failure")}}));
 let before=f.state();expect(()=>f.run("set a fail x")).toThrow("partial failure");expect(f.state()).toEqual(before);
 f.registry.register(c=>c.registerAttribute({name:"feedback-failure",handles:q=>q.name==="feedback-fail",apply:p=>p.setDefault("a-label","text","changed"),describeOperation:()=>{throw new Error("feedback failure")}}));
 expect(()=>f.run("set a feedback-fail x")).toThrow("feedback failure");expect(f.state()).toEqual(before);
 f.registry.register(c=>c.registerAttribute({name:"conflict",handles:q=>q.target.kind==="box"&&q.name==="fill",apply:()=>{throw new Error("must not run")}}));
 before=f.state();expect(()=>f.run("set a fill red")).toThrow("attribute handler conflict");expect(f.state()).toEqual(before);
});
it.each(["a","a-rect","a-label"])("rejects the entire create on global ID collision at %s",id=>{
 const f=fixture();f.run("init");f.run(`create g ${id}`);const before=f.state();expect(()=>f.run('create box a 1 2 3 4 "A"')).toThrow(`id already exists: ${id}`);expect(f.state()).toEqual(before);
});
it("protects required parts while allowing extras, direct edits and reordering",()=>{
 const f=fixture();f.run("init");f.run('create box a 1 2 3 4 "A"');f.run("create g destination");const before=f.state();
 for(const text of ["delete a-rect","delete a-label","addto destination a-label","group stolen a-rect","ungroup a"]){expect(()=>f.run(text)).toThrow();expect(f.state()).toEqual(before);}
 expect(()=>f.run("ungroup a")).toThrow("cannot ungroup composite shape: a");f.run("create circle extra 1 2 3 in a");f.run("set a-label x 100");f.run("front a-rect");expect(f.editor.tree("a").children.at(-1)?.id).toBe("a-rect");expect(f.run("tree a")).toContain("g#a (box)");
});
it("round-trips styles, text escaping and reordered parts, with no-plugin downgrade",async()=>{
 const f=fixture(),path=join(await directory(),"box.svg");f.run("init");f.run('create box a 1 2 3 4 "A & 😀"');f.run('create box b 2 3 4 5 "B" in a');f.run("set a stroke blue");f.run("set a stroke-width 2");f.run("front a-rect");const before=f.editor.tree();await f.editor.save(path);await f.editor.read(path);expect(f.editor.tree()).toEqual(before);
 const xml=await fs.readFile(path,"utf8");expect(xml).toContain('data-kind="box"');expect(xml).toContain('A &amp; 😀');const absent=createEditor();await absent.read(path);expect(absent.tree("a").kind).toBe("g");expect(absent.tree("b").kind).toBe("g");expect(absent.tree("a-label").attributes.text).toBe("A & 😀");
});
it.each([
 '<g id="a" data-kind="box"/>',
 '<g id="a" data-kind="box"><g id="a-rect"/><text id="a-label" x="0" y="0">A</text></g>',
 '<g id="a" data-kind="box"><rect id="a-rect" x="0" y="0" width="1" height="1"/><text id="a-label" x="0" y="0">A</text><g id="a-rect"/></g>',
])("rejects malformed recognized box reads and preserves content/path/baseline/history",async body=>{
 const f=fixture(),dir=await directory(),good=join(dir,"good.svg"),bad=join(dir,"bad.svg");f.run("init");f.run('create box keep 1 2 3 4 "kept"');await f.editor.save(good);await f.editor.read(good);f.run("move keep 1 0");const before=f.state();await fs.writeFile(bad,`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1">${body}</svg>`);await expect(f.editor.read(bad)).rejects.toThrow();expect(f.state()).toEqual(before);await f.editor.save();expect(await fs.readFile(good,"utf8")).toContain('id="keep"');
});
it("executes the complete Phase 1 §6.1 B input with exact feedback and Phase 1-compatible tree formatting",async()=>{
 const root=resolve(__dirname,"../.."),cwd=await directory();const input=await fs.readFile(join(root,"doc/transcript/box-version-b.txt"));
 const result=spawnSync(process.execPath,["--import",require.resolve("tsx"),join(root,"src/main.ts"),"--config",join(root,"plugins.config.json")],{cwd,input,timeout:15000,env:{...process.env,NO_COLOR:"1",FORCE_COLOR:"0",TSX_DISABLE_CACHE:"1"}});
 expect(result.status).toBe(0);expect(result.signal).toBeNull();expect(result.stderr).toEqual(Buffer.alloc(0));expect(result.stdout).toEqual(await fs.readFile(join(__dirname,"fixtures/box-version-b.stdout.txt")));
 const f=fixture();await f.editor.read(join(cwd,"flowchart-box.svg"));expect(f.editor.tree("n2-label").attributes).toMatchObject({x:540,y:135,text:"处理数据"});expect(f.editor.tree("n2-rect").attributes.fill).toBe("#f5a623");
});
