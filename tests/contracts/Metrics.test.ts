import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
const metrics = require("../../docs/metrics/collect.mjs") as {
 classify(path:string):string|undefined;
 analyzeSources(sources:{path:string;source:string}[]): {lines:number;sloc:number;functions:number;cc:number;ccFunctions:number;ccModule:number;scopes:{name:string;complexity:number}[]}[];
 collect(base:string,target:string,out:string,freezeScope?:boolean):{baseline:{commit:string;totals:Record<string,Record<string,number>>};current:{commit:string;totals:Record<string,Record<string,number>>};delta:Record<string,Record<string,number>>};
};
function analyze(source:string){return metrics.analyzeSources([{path:"probe.ts",source}])[0]!;}
it("counts actual AST decisions per independent function and module, excluding comments and nested duplication",()=>{
 const result=analyze('function f(a:boolean,b:boolean){if(a&&b)return a?1:2;for(let i=0;i<1;i++){}try{}catch{}return a??b;}');
 expect(result.functions).toBe(1);expect(result.ccFunctions).toBe(7);expect(result.ccModule).toBe(1);expect(result.cc).toBe(8);
 const nested=analyze('function outer(a:boolean){const inner=()=>a?1:0;return a||false;}');expect(nested.scopes.map(s=>s.complexity)).toEqual([1,2,2]);
});
it("does not count type-only APIs as executable paths and handles code/comment/string/template lines",()=>{
 expect(analyze('export interface Query {x:string}\nexport type X=string;').cc).toBe(0);
 const result=analyze('// if for while\nconst regex=/[/][*]/; // comment\n/* block\n comment */\nconst text=`// inside\n/* still text */`;\n');
 expect(result.lines).toBe(6);expect(result.sloc).toBe(3);expect(result.cc).toBe(1);
});
it("separates kernel/host/plugins/VSCode and excludes tests, declarations and dependencies",()=>{
 for(const [path,role] of [["src/api/A.ts","kernel"],["src/main.ts","host"],["src/host/loading/A.ts","host"],["plugins/example/index.ts","plugins"],["vscode-extension/src/extension.ts","vscode"]])expect(metrics.classify(path!)).toBe(role);
 for(const path of ["tests/a.ts","plugins/a/node_modules/x.ts","plugins/a/dist/a.js","src/generated.d.ts","vscode-extension/test/a.ts","plugins/a/Shape.test.ts","src/helper.spec.ts"])expect(metrics.classify(path)).toBeUndefined();
});
it("reproduces both Git-history snapshots byte-for-byte and never merges VSCode into CLI totals",()=>{
 const first=mkdtempSync(join(tmpdir(),"metrics-one-")),second=mkdtempSync(join(tmpdir(),"metrics-two-"));
 try {
  const result=metrics.collect("final","HEAD",first,true);metrics.collect("final","HEAD",second,true);
  for(const file of ["metrics.json","report.md","freeze-scope.json"])expect(readFileSync(join(first,file))).toEqual(readFileSync(join(second,file)));
  expect(result.baseline.commit).toBe("177eb20e131849132a777ec0ca576c37a5b00728");expect(result.baseline.totals.plugins!.files).toBe(0);expect(result.current.totals.plugins!.files).toBeGreaterThan(0);
  expect(result.current.totals.cli!.sloc).toBe(result.current.totals.kernel!.sloc!+result.current.totals.host!.sloc!+result.current.totals.plugins!.sloc!);
  expect(result.current.totals.vscode!.files).toBe(4);
 } finally {rmSync(first,{recursive:true,force:true});rmSync(second,{recursive:true,force:true});}
});
