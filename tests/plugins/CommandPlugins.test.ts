import { PassThrough, Readable } from "node:stream";
import { Repl } from "../../src/cli/Repl";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { register } from "tsx/cjs/api";
import { afterAll, afterEach, expect, it } from "vitest";
import { defaultRegistry, createEditor } from "../../src/host/composition";
import { PluginInstaller } from "../../src/host/loading/PluginInstaller";
import { PluginLoader } from "../../src/host/loading/PluginLoader";
import { Parser } from "../../src/cli/Parser";
import { CommandCatalog } from "../../src/cli/CommandCatalog";
import { Dispatcher } from "../../src/cli/Dispatcher";
import { Formatter } from "../../src/cli/Formatter";
import { DirCommand } from "../../plugins/command-dir/DirCommand";
import * as stats from "../../plugins/command-stats";
import * as dir from "../../plugins/command-dir";
// Match the production TS require environment for in-process configuration tests.
const unregister = register();
afterAll(unregister);
const root=resolve(__dirname,"../.."),directories:string[]=[];
afterEach(async()=>{for(const path of directories.splice(0))await fs.rm(path,{recursive:true,force:true});});
async function directory(){const path=await fs.mkdtemp(join(tmpdir(),"svg-commands-"));directories.push(path);return path;}
async function configuration(entries:unknown[]){const path=join(await directory(),"plugins.config.json");await fs.writeFile(path,JSON.stringify({plugins:entries}));return path;}
function entry(name:string,enabled=true){return {module:join(root,"plugins",`command-${name}`),enabled};}
function fixture(registry=defaultRegistry()){
 const editor=createEditor(registry),catalog=new CommandCatalog(registry),parser=new Parser(catalog),dispatcher=new Dispatcher(editor,catalog,new Formatter(registry,()=>editor.observation()));
 return {registry,editor,run:(text:string)=>dispatcher.execute(parser.parse(text)!),state:()=>({view:editor.tree(),status:editor.getStatus(),observation:editor.observation()})};
}
it.each([[true,false],[false,true],[true,true]])("loads independent manifests via configuration: stats=%s dir=%s",async(s,d)=>{
 const f=fixture(),config=await configuration([entry("stats",s),entry("dir",d)]);
 expect(new PluginLoader(new PluginInstaller(f.registry)).loadFile(config)).toEqual([]);const help=await f.run("help");
 if(s)expect(help).toContain("stats");else expect(help).not.toContain("stats");expect(f.registry.command("stats")!==undefined).toBe(s);expect(f.registry.command("dir")!==undefined).toBe(d);
 if(s){f.run("init");expect(f.run("stats")).toEqual(["(total 0, containers 0)"]);}else expect(()=>f.run("stats")).toThrow("unknown command: stats");
 if(!d)expect(()=>f.run("dir")).toThrow("unknown command: dir");else {expect(help).toContain("dir");expect(await f.run("dir")).toHaveProperty("stdout");}
});
it("preserves IO barriers and existing undo/redo and saved content through successful and failed read-only commands",async()=>{
 const registry=defaultRegistry();let fail=false;
 new PluginInstaller(registry).installCode([{module:"stats",manifest:{name:"stats",contributes:{commands:["stats"]}},exports:stats}]);
 registry.register(c=>c.registerCommand(new DirCommand({currentDirectory:()=>"/mock",read:async()=>{if(fail)throw new Error("denied");return []}})));
 const f=fixture(registry);f.run("init");const barrier=f.state();f.run("stats");await f.run("dir");expect(f.state()).toEqual(barrier);
 f.run("create g group");f.run("create rect r 0 0 1 1 in group");f.run("move r 1 0");f.run("undo");const before=f.state();
 expect(f.run("stats")).toEqual(["rect: 1  (total 1, containers 1)"]);await f.run("dir");expect(f.state()).toEqual(before);
 fail=true;await expect(f.run("dir")).rejects.toThrow("cannot read directory: /mock");expect(f.state()).toEqual(before);f.run("redo");expect(f.editor.tree("r").attributes.x).toBe(1);
 const afterRedo=f.state(),output=new PassThrough(),errors=new PassThrough();let stdout="",stderr="";
 output.on("data",chunk=>{stdout+=chunk.toString()});errors.on("data",chunk=>{stderr+=chunk.toString()});
 await new Repl(Readable.from(["dir\nstats\n"]),output,errors,false,f.editor).run();
 expect(stderr).toBe("error: cannot read directory: /mock\n");expect(stdout).toBe("rect: 1  (total 1, containers 1)\n");expect(f.state()).toEqual(afterRedo);
});
const tsx=require.resolve("tsx");
function cli(args:string[],cwd:string,input:string){return spawnSync(process.execPath,["--import",tsx,join(root,"src/main.ts"),...args],{cwd,input,timeout:15000,env:{...process.env,NO_COLOR:"1",FORCE_COLOR:"0",TSX_DISABLE_CACHE:"1"}});}
it("lists process cwd after read/save of an SVG elsewhere, and survives an error before later commands",async()=>{
 const cwd=await directory(),outside=await directory(),source=join(outside,"source.svg"),saved=join(outside,"saved.svg");await fs.writeFile(join(cwd,".cwd-only"),"");await fs.writeFile(source,'<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"/>');
 const config=await configuration([entry("stats"),entry("dir")]);const result=cli(["--config",config],cwd,`dir\nstats\nread "${source}"\nsave "${saved}"\ndir\nstats\n`);
 expect(result.status).toBe(0);expect(result.stderr.toString()).toBe("error: no document. use 'init' or 'read' first\n");const output=result.stdout.toString();expect(output.match(/\[FILE\]  \.cwd-only/g)).toHaveLength(2);expect(output).not.toContain("[FILE]  source.svg");expect(output).toContain("(total 0, containers 0)");
});
it("shares the same plugin implementations in code and configuration assembly on an unchanged fixed directory",async()=>{
 const cwd=await directory();await fs.mkdir(join(cwd,"z-dir"));await fs.writeFile(join(cwd,".hidden"),"");await fs.writeFile(join(cwd,"A.txt"),"");
 const config=await configuration([entry("stats"),entry("dir")]);
 const script=`const fs=require('node:fs');const {defaultRegistry,createEditor}=require(${JSON.stringify(join(root,"src/host/composition.ts"))});
const {PluginInstaller}=require(${JSON.stringify(join(root,"src/host/loading/PluginInstaller.ts"))});const {Repl}=require(${JSON.stringify(join(root,"src/cli/Repl.ts"))});const registry=defaultRegistry();
const plugins=${JSON.stringify(["stats","dir"].map(name=>join(root,"plugins",`command-${name}`)))};
const errors=new PluginInstaller(registry).installCode(plugins.map(module=>({module,manifest:JSON.parse(fs.readFileSync(module+'/package.json','utf8')),exports:require(module)})));for(const error of errors)process.stderr.write(error+'\\n');
new Repl(process.stdin,process.stdout,process.stderr,false,createEditor(registry)).run().catch(e=>{console.error(e);process.exitCode=1});`;
 const input="dir\ninit\ncreate circle c 1 2 3\nstats\nhelp\n";
 const a=spawnSync(process.execPath,["--import",tsx,"-e",script],{cwd,input,timeout:15000,env:{...process.env,TSX_DISABLE_CACHE:"1",NO_COLOR:"1",FORCE_COLOR:"0"}}),b=cli(["--config",config],cwd,input);
 expect(a.status).toBe(0);expect(b.status).toBe(0);expect(a.stdout).toEqual(b.stdout);expect(a.stderr).toEqual(b.stderr);expect(b.stderr.toString()).toBe("");expect(b.stdout.toString()).toContain("[DIR]  z-dir\n[FILE]  .hidden\n[FILE]  A.txt\n");
});
it("loads the committed shared root configuration and keeps the default no-config entry plugin-free",()=>{
 const f=fixture();expect(new PluginLoader(new PluginInstaller(f.registry)).loadFile(join(root,"plugins.config.json"))).toEqual([]);expect(f.registry.contributions().commands.slice(-2)).toEqual(["stats","dir"]);
 expect(defaultRegistry().command("stats")).toBeUndefined();expect(defaultRegistry().command("dir")).toBeUndefined();
});
