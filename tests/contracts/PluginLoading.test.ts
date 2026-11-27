import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginManifest, PluginModule, PluginValue, RegistrationContext } from "../../src/api";
import { ExtensionRegistry } from "../../src/extensions/ExtensionRegistry";
import { defaultRegistry } from "../../src/host/composition";
import { PluginInstaller } from "../../src/host/loading/PluginInstaller";
import { PluginLoader } from "../../src/host/loading/PluginLoader";
import { ProbeProvider, ProbeQueryCommand, ProbeDecorator, ProbeAttribute } from "../support/RegistryExtensions";

const directories: string[] = [];
function temporary() { const path=fs.mkdtempSync(join(tmpdir(),"svg-loader-"));directories.push(path);return path; }
afterEach(()=>{for(const path of directories.splice(0))fs.rmSync(path,{recursive:true,force:true});});
function write(path:string, text:string) {fs.mkdirSync(dirname(path),{recursive:true});fs.writeFileSync(path,text);}
function packageAt(directory:string, name:string, source:string, contributes:unknown={}, main="index.cjs") {
  write(join(directory,"package.json"),JSON.stringify({name,main,contributes}));write(join(directory,main),source);return directory;
}
function config(directory:string, plugins:unknown) {const path=join(directory,"plugins.config.json");write(path,JSON.stringify({plugins}));return path;}
function command(name:string) {return `class Query {name=${JSON.stringify(name)};syntax=${JSON.stringify(name)};parse(){return {mode:'query',execute(){return {stdout:['ok'],stderr:[]}}}}} ctx.registerCommand(new Query());`;}
function cjs(name:string) {return `exports.default={activate(ctx,options){${command(name)}}};`;}
function setup() {const registry=new ExtensionRegistry(),installer=new PluginInstaller(registry);return {registry,installer,loader:new PluginLoader(installer)};}
const four={shapes:["probe-leaf"],commands:["inspect-probe"],decorators:["tag"],attributes:["probe-pair"]};
function all(context:RegistrationContext) {context.registerShape(new ProbeProvider());context.registerCommand(new ProbeQueryCommand());context.registerDecorator(new ProbeDecorator("tag","tag"));context.registerAttribute(new ProbeAttribute());}

describe("shared manifest and atomic installation",()=>{
  it("installs all four categories using the existing Registry commit, comparing name sets",()=>{
    const f=setup(),register=vi.spyOn(f.registry,"register");
    expect(f.installer.installCode([{module:"code",manifest:{name:"code",contributes:four},exports:{default:{activate:all}}}])).toEqual([]);
    expect(f.registry.contributions()).toEqual(four);expect(register).toHaveBeenCalledOnce();
  });
  it("treats omitted categories as empty and compares declaration order as sets",()=>{
    const f=setup();expect(f.installer.install("empty",{name:"empty"},{default:{activate(){}}})).toBeUndefined();
    expect(f.installer.install("ordered",{name:"ordered",contributes:{commands:["z","a"]}},{default:{activate(c:RegistrationContext){c.registerCommand(new ProbeQueryCommand("a"));c.registerCommand(new ProbeQueryCommand("z"));}}})).toBeUndefined();
    expect(f.registry.contributions().commands).toEqual(["a","z"]);
  });
  it("reports manifest mismatch precisely and rolls back all categories",()=>{
    const f=setup();const output=f.installer.install("code",{name:"wrong"},{default:{activate:all}});
    expect(output).toBe('error: plugin manifest mismatch: wrong (declared: {"shapes":[],"commands":[],"decorators":[],"attributes":[]}, registered: {"shapes":["probe-leaf"],"commands":["inspect-probe"],"decorators":["tag"],"attributes":["probe-pair"]})');
    expect(f.registry.contributions()).toEqual({shapes:[],commands:[],decorators:[],attributes:[]});
  });
  it.each([null,{}, {name:"bad name"},{name:"p",contributes:null},{name:"p",contributes:{shapes:null}},{name:"p",contributes:{other:[]}},{name:"p",contributes:{commands:["x","x"]}},{name:"p",contributes:{commands:[1]}}])("rejects malformed manifest %j before activation",metadata=>{
    const f=setup(),activate=vi.fn();expect(f.installer.install("module",metadata,{default:{activate}})).toBe("error: plugin failed to activate: module (invalid plugin manifest)");expect(activate).not.toHaveBeenCalled();
  });
  it.each([{}, {activate(){}}, Object.create({default:{activate(){}}})])("requires an own default export",exports=>{
    const f=setup();expect(f.installer.install("module",{name:"plugin"},exports)).toBe("error: plugin has no default export: module");
  });
  it.each([null,undefined,{},7])("rejects invalid default value %j",value=>{
    expect(setup().installer.install("module",{name:"plugin"},{default:value})).toBe("error: plugin failed to activate: plugin (invalid plugin default export)");
  });
  it("rolls back partial registration on activate failure, including a misleading duplicate message",()=>{
    const f=setup();expect(f.installer.install("module",{name:"failed",contributes:four},{default:{activate(c:RegistrationContext){all(c);throw new Error("duplicate registration: commands/fake");}}})).toBe("error: plugin failed to activate: failed (duplicate registration: commands/fake)");expect(f.registry.contributions().shapes).toEqual([]);
    expect(f.installer.install("next",{name:"next",contributes:four},{default:{activate:all}})).toBeUndefined();
  });
  it.each(["shapes","commands","decorators","attributes"] as const)("reports %s duplicates without overwriting existing entries or leaving staged entries",category=>{
    const f=setup();f.installer.install("first",{name:"first",contributes:four},{default:{activate:all}});const before=f.registry.contributions();
    const duplicate={shapes:(c:RegistrationContext)=>c.registerShape(new ProbeProvider()),commands:(c:RegistrationContext)=>c.registerCommand(new ProbeQueryCommand()),decorators:(c:RegistrationContext)=>c.registerDecorator(new ProbeDecorator("tag","other")),attributes:(c:RegistrationContext)=>c.registerAttribute(new ProbeAttribute())};
    expect(f.installer.install("second",{name:"second"},{default:{activate(c:RegistrationContext){c.registerCommand(new ProbeQueryCommand("staged"));duplicate[category](c);}}})).toBe(`error: duplicate registration: ${category}/${four[category][0]}`);
    expect(f.registry.contributions()).toEqual(before);expect(f.registry.command("staged")).toBeUndefined();
  });
  it("rolls back selector conflicts and continues code assembly after a failed plugin",()=>{
    const f=setup();f.registry.register(c=>c.registerShape(new ProbeProvider()));
    const errors=f.installer.installCode([
      {module:"selector",manifest:{name:"selector",contributes:{shapes:["other"]}},exports:{default:{activate(c){c.registerShape(new ProbeProvider("other"));}}}},
      {module:"after",manifest:{name:"after",contributes:{commands:["after"]}},exports:{default:{activate(c){c.registerCommand(new ProbeQueryCommand("after"));}}}},
    ]);
    expect(errors).toEqual(['error: plugin failed to activate: selector (duplicate svg selector: ["urn:test:svg","probe",null])']);
    expect(f.registry.contributions().shapes).toEqual(["probe-leaf"]);expect(f.registry.contributions().commands).toEqual(["after"]);
  });
  it("rejects duplicate registration inside one activation before publishing any contribution",()=>{
    const f=setup();const error=f.installer.install("twice",{name:"twice",contributes:{commands:["same"]}},{default:{activate(c:RegistrationContext){c.registerCommand(new ProbeQueryCommand("same"));c.registerCommand(new ProbeQueryCommand("same"));}}});
    expect(error).toBe("error: duplicate registration: commands/same");expect(f.registry.contributions().commands).toEqual([]);
  });
  it("validates against a detached manifest snapshot if the caller changes the declaration during activation",()=>{
    const f=setup(),names=["a"];
    expect(f.installer.install("snapshot",{name:"snapshot",contributes:{commands:names}},{default:{activate(c:RegistrationContext){names.push("later");c.registerCommand(new ProbeQueryCommand("a"));}}})).toBeUndefined();
    expect(names).toEqual(["a","later"]);expect(f.registry.contributions().commands).toEqual(["a"]);
  });
  it("copies and freezes code options and manifest before activation",()=>{
    const f=setup(),options={nested:{value:3}},metadata:PluginManifest={name:"options",contributes:{}};let received:PluginValue|undefined;
    expect(f.installer.install("options",metadata,{default:{activate(_c:RegistrationContext,input?:PluginValue){received=input;expect(Object.isFrozen(input)).toBe(true);expect(Object.isFrozen((input as typeof options).nested)).toBe(true);}}},options)).toBeUndefined();options.nested.value=9;expect(received).toEqual({nested:{value:3}});
  });
  it.each([NaN,()=>{},new Date(),{nested:undefined}])("rejects non-JSON code options",options=>{
    const f=setup();expect(f.installer.install("options",{name:"options"},{default:{activate(){}}},options)).toBe("error: plugin failed to activate: options (invalid plugin options)");
  });
  it("rejects asynchronous activation, expires the context, and permits later plugins",async()=>{
    const f=setup();expect(f.installer.install("async",{name:"async"},{default:{async activate(c:RegistrationContext){c.registerCommand(new ProbeQueryCommand());await Promise.resolve();c.registerCommand(new ProbeQueryCommand("late"));}}})).toBe("error: plugin failed to activate: async (activation must be synchronous and return void)");await Promise.resolve();
    expect(f.registry.contributions().commands).toEqual([]);expect(f.installer.install("next",{name:"next",contributes:four},{default:{activate:all}})).toBeUndefined();
  });
});

describe("real runtime module resolution and config failures",()=>{
  it("loads relative packages in configuration order, continues after failure and skips disabled evaluation",()=>{
    const dir=temporary(),f=setup();packageAt(join(dir,"first"),"first",cjs("first"),{commands:["first"]});packageAt(join(dir,"bad"),"bad",`exports.default={activate(ctx){${command("partial")}throw new Error('boom')}}`,{commands:["partial"]});packageAt(join(dir,"next"),"next",cjs("next"),{commands:["next"]});
    packageAt(join(dir,"disabled"),"disabled",`throw new Error('must not evaluate')`);
    const before=process.cwd();expect(f.loader.loadFile(config(dir,[{module:"./first"},{module:"./bad"},{module:"./disabled",enabled:false},{module:"./missing",enabled:false},{module:"./next"}]))).toEqual(["error: plugin failed to activate: bad (boom)"]);expect(process.cwd()).toBe(before);expect(f.registry.contributions().commands).toEqual(["first","next"]);
  });
  it("uses the same Installer and Registry path for code and runtime configuration",()=>{
    const dir=temporary(),f=setup(),install=vi.spyOn(f.installer,"install"),register=vi.spyOn(f.registry,"register");
    expect(f.installer.installCode([{module:"code",manifest:{name:"empty"},exports:{default:{activate(){}}}}])).toEqual([]);
    packageAt(join(dir,"runtime"),"runtime",cjs("runtime"),{commands:["runtime"]});
    expect(f.loader.loadFile(config(dir,[{module:"./runtime"}]))).toEqual([]);
    expect(install).toHaveBeenCalledTimes(2);expect(register).toHaveBeenCalledTimes(2);
  });
  it("passes deeply frozen JSON options through actual CJS loading",()=>{
    const dir=temporary(),f=setup();
    packageAt(join(dir,"options"),"options",`exports.default={activate(ctx,options){if(!Object.isFrozen(options)||!Object.isFrozen(options.nested))throw new Error('unfrozen');class Query{name='options';syntax='options';parse(){return {mode:'query',execute(){return {stdout:[String(options.nested.value)],stderr:[]}}}}}ctx.registerCommand(new Query());}}`,{commands:["options"]});
    expect(f.loader.loadFile(config(dir,[{module:"./options",options:{nested:{value:9}}}]))).toEqual([]);
    const invocation=f.registry.command("options")!.parse([],f.registry.shapeServices());
    if(invocation.mode!=="query")throw new Error("wrong invocation");expect(invocation.execute({document:null,rendering:{tree:()=>[],show:()=>[]}})).toEqual({stdout:["9"],stderr:[]});
  });
  it("keeps diagnostics on one physical line for unusual module paths",()=>{
    const dir=temporary(),f=setup();expect(f.loader.loadFile(config(dir,[{module:"./missing\nname"}]))).toEqual(["error: plugin not found: ./missing\\nname"]);
  });
  it("distinguishes unresolved target from missing internal dependency",()=>{
    const dir=temporary(),f=setup();packageAt(join(dir,"dependent"),"dependent",`require('./missing-inner.cjs');exports.default={activate(){}};`);
    const errors=f.loader.loadFile(config(dir,[{module:"./absent"},{module:"./dependent"}]));expect(errors[0]).toBe("error: plugin not found: ./absent");expect(errors[1]).toMatch(/^error: plugin failed to activate: dependent \(Cannot find module '\.\/missing-inner.cjs'/);expect(errors[1]).not.toContain("\n");
  });
  it("handles no default, syntax error, manifest mismatch, duplicate and subsequent success exactly",()=>{
    const dir=temporary(),f=setup();packageAt(join(dir,"plain"),"plain",`module.exports={activate(){}}`);packageAt(join(dir,"syntax"),"syntax",`this is not JavaScript!`);packageAt(join(dir,"mismatch"),"mismatch",cjs("unexpected"));packageAt(join(dir,"one"),"one",cjs("same"),{commands:["same"]});packageAt(join(dir,"two"),"two",cjs("same"),{commands:["same"]});packageAt(join(dir,"last"),"last",cjs("last"),{commands:["last"]});
    const errors=f.loader.loadFile(config(dir,["plain","syntax","mismatch","one","two","last"].map(name=>({module:`./${name}`}))));expect(errors[0]).toBe("error: plugin has no default export: ./plain");expect(errors[1]).toMatch(/^error: plugin failed to activate: syntax \(/);expect(errors[2]).toBe('error: plugin manifest mismatch: mismatch (declared: {"shapes":[],"commands":[],"decorators":[],"attributes":[]}, registered: {"shapes":[],"commands":["unexpected"],"decorators":[],"attributes":[]})');expect(errors[3]).toBe("error: duplicate registration: commands/same");expect(f.registry.contributions().commands).toEqual(["same","last"]);
  });
  it("resolves bare scoped packages and finds manifest above a nested entry",()=>{
    const dir=temporary(),f=setup(),pkg=join(dir,"node_modules/@test/nested");packageAt(pkg,"@test/nested",cjs("nested"),{commands:["nested"]},"dist/index.cjs");
    expect(f.loader.loadFile(config(dir,[{module:"@test/nested"}]))).toEqual([]);expect(f.registry.contributions().commands).toEqual(["nested"]);
  });
  it.each([null,[],{}, {plugins:null},{plugins:{}},{plugins:[{}]},{plugins:[{module:""}]},{plugins:[{module:3}]},{plugins:[{module:"x",enabled:0}]},{plugins:[{module:"x",extra:true}]},{plugins:[],extra:true}])("rejects malformed entire config %j",value=>{
    const dir=temporary(),path=join(dir,"bad.json");write(path,JSON.stringify(value));const f=setup();expect(f.loader.loadFile(path)).toEqual(["error: invalid plugin config"]);expect(f.registry.contributions().commands).toEqual([]);
  });
  it("rejects unreadable/invalid JSON configs before activating any entry",()=>{
    const dir=temporary(),f=setup();expect(f.loader.loadFile(join(dir,"missing.json"))).toEqual(["error: invalid plugin config"]);write(join(dir,"bad.json"),"{");expect(f.loader.loadFile(join(dir,"bad.json"))).toEqual(["error: invalid plugin config"]);
    const marker=join(dir,"evaluated");packageAt(join(dir,"first"),"first",`require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad');exports.default={activate(){}}`);expect(f.loader.loadFile(config(dir,[{module:"./first"},{module:"wrong",enabled:"false"}]))).toEqual(["error: invalid plugin config"]);expect(fs.existsSync(marker)).toBe(false);
  });
});

describe("actual Node + tsx dual assembly",()=>{
  const root=resolve(__dirname,"../.."),tsx=require.resolve("tsx"),plugin=join(root,"tests/fixtures/plugins/loader-probe");
  function run(entry:string,args:string[],cwd:string,input:string) {return spawnSync(process.execPath,["--import",tsx,entry,...args],{cwd,input,timeout:15000,env:{...process.env,NO_COLOR:"1",FORCE_COLOR:"0",TSX_DISABLE_CACHE:"1"}});}
  it("has byte-identical stdout/stderr/exit code/SVG and actual behavior for all four contributions",()=>{
    const cwd=temporary(),configDir=temporary(),options={label:"中文 😀"};const file=config(configDir,[{module:relative(configDir,plugin),options}]);
    const input='loader-echo\ninit\ncreate loader-leaf p 3\nset p pair 7\nundo\nredo\ntree\nshow p\nsave result.svg\nread result.svg\nloader-echo\ntree\n';
    const a=run(join(root,"tests/support/code-plugin-session.cjs"),[JSON.stringify(options)],cwd,input);const svgA=fs.readFileSync(join(cwd,"result.svg"));fs.unlinkSync(join(cwd,"result.svg"));
    const b=run(join(root,"src/main.ts"),["--config",file],cwd,input);expect(b.status).toBe(0);expect(a.status).toBe(b.status);expect(a.signal).toBeNull();expect(b.signal).toBeNull();expect(a.stdout).toEqual(b.stdout);expect(a.stderr).toEqual(b.stderr);expect(b.stderr).toEqual(Buffer.alloc(0));expect(fs.readFileSync(join(cwd,"result.svg"))).toEqual(svgA);
    const text=b.stdout.toString();expect(text).toContain("中文 😀\n0\n");expect(text).toContain("pair undo\npair redo\n");expect(text).toContain("svg (800x600) [中文 😀]");expect(text).toContain("leaf#p  value=7 [中文 😀]");expect(svgA.toString()).toContain('xmlns="urn:loader-test"');
  });
  it("produces identical contribution sets under real code and TS configuration loading",()=>{
    const cwd=temporary(),file=config(temporary(),[{module:plugin,options:{label:"same"}}]);
    const script=`const assert=require('node:assert/strict');const fs=require('node:fs');
const {defaultRegistry}=require(${JSON.stringify(join(root,"src/host/composition.ts"))});
const {PluginInstaller}=require(${JSON.stringify(join(root,"src/host/loading/PluginInstaller.ts"))});
const {PluginLoader}=require(${JSON.stringify(join(root,"src/host/loading/PluginLoader.ts"))});
const a=defaultRegistry(),b=defaultRegistry();
const exports=require(${JSON.stringify(join(plugin,"index.ts"))});const manifest=JSON.parse(fs.readFileSync(${JSON.stringify(join(plugin,"package.json"))},'utf8'));
assert.deepEqual(new PluginInstaller(a).installCode([{module:'code',manifest,exports,options:{label:'same'}}]),[]);
assert.deepEqual(new PluginLoader(new PluginInstaller(b)).loadFile(${JSON.stringify(file)}),[]);
assert.deepEqual(a.contributions(),b.contributions());console.log(JSON.stringify(a.contributions()));`;
    const result=run("-e",[script],cwd,"");expect(result.status).toBe(0);expect(result.stderr.toString()).toBe("");
    const names=JSON.parse(result.stdout.toString());expect(names.shapes).toContain("loader-leaf");expect(names.commands).toContain("loader-echo");expect(names.decorators).toEqual(["loader-tag"]);expect(names.attributes).toEqual(["loader-pair"]);
  });
  it("continues CLI after invalid config using all default capabilities",()=>{
    const cwd=temporary(),file=join(cwd,"invalid.json");write(file,"{ invalid");const result=run(join(root,"src/main.ts"),["--config",file],cwd,"init\ncreate rect r 1 2 3 4\ntree\n");expect(result.status).toBe(0);expect(result.stderr.toString()).toBe("error: invalid plugin config\n");expect(result.stdout.toString()).toBe("canvas 800x600 created\nrect#r created\nsvg (800x600)\n└── rect#r  x=1 y=2 w=3 h=4\n");
  });
  it("loads TS via the real runtime with partial module failures and later successful plugin",()=>{
    const cwd=temporary(),dir=temporary();packageAt(join(dir,"throw"),"throw",`exports.default={activate(){throw new Error('failed')}}`);const file=config(dir,[{module:"./missing"},{module:"./throw"},{module:plugin,options:{label:"after"}}]);const result=run(join(root,"src/main.ts"),["--config",file],cwd,"loader-echo\ninit\n");expect(result.status).toBe(0);expect(result.stderr.toString()).toBe("error: plugin not found: ./missing\nerror: plugin failed to activate: throw (failed)\n");expect(result.stdout.toString()).toBe("after\n0\ncanvas 800x600 created\n");
  });
  it("loads native ESM default exports on the tested Node runtime",()=>{
    const cwd=temporary(),dir=temporary();packageAt(join(dir,"esm"),"esm",`export default {activate(ctx){${command("esm")}}}`,{commands:["esm"]},"index.mjs");const result=run(join(root,"src/main.ts"),["--config",config(dir,[{module:"./esm"}])],cwd,"esm\n");expect(result.status).toBe(0);expect(result.stderr.toString()).toBe("");expect(result.stdout.toString()).toBe("ok\n");
  });
});


it("keeps the generic loader free of concrete plugin names and implementation imports",()=>{
  const directory=resolve(__dirname,"../../src/host/loading");
  for(const entry of fs.readdirSync(directory)) {
    const source=fs.readFileSync(join(directory,entry),"utf8");
    expect(source,entry).not.toMatch(/builtin-shapes|builtin-commands|loader-probe|command-stats|command-dir|shape-box|tree-star/);
    expect(source,entry).not.toMatch(/from\s+["'][^"']*(?:plugins|model|commands|services|cli)\//);
  }
  const directoryOfPlugin=resolve(__dirname,"../fixtures/plugins/loader-probe");
  for(const entry of fs.readdirSync(directoryOfPlugin).filter(file=>file.endsWith(".ts"))) {
    const source=fs.readFileSync(join(directoryOfPlugin,entry),"utf8");
    for(const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const dependency=resolve(directoryOfPlugin,match[1]!);
      expect(dependency===resolve(__dirname,"../../src/api")||dependency.startsWith(directoryOfPlugin+"/")).toBe(true);
    }
  }
});
