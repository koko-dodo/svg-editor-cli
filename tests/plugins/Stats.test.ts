import { expect, it } from "vitest";
import type { DocumentView, QueryCommandContext, ShapeView } from "../../src/api";
import { StatsCommand } from "../../plugins/command-stats/StatsCommand";

const node=(kind:string,children:readonly ShapeView[]|null=null):ShapeView=>Object.freeze({id:kind,kind,type:"unrelated legacy class",container:children!==null,parentId:null,attributes:Object.freeze({}),children:Object.freeze(children??[])});
function context(roots:readonly ShapeView[]):QueryCommandContext {
 const document:DocumentView=Object.freeze({width:1,height:1,roots:Object.freeze(roots)});
 return {document:{view:()=>document,find:()=>undefined,parentId:()=>null},rendering:{tree:()=>[],show:()=>[]}};
}
function execute(ctx:QueryCommandContext){const plan=new StatsCommand().parse([]);if(plan.mode!=="query")throw new Error("not a query");return plan.execute(ctx);}
it.each([
 [[],"(total 0, containers 0)"],
 [[node("custom-container",[])],"(total 0, containers 1)"],
 [[node("g",[node("rect"),node("semantic-container",[node("circle"),node("rect")])]),node("text"),node("circle")],"rect: 2  circle: 2  text: 1  (total 5, containers 2)"],
])("counts DFS leaf kinds and containers without counting SVG root",(roots,expected)=>{
 const ctx=context(roots as readonly ShapeView[]),before=ctx.document!.view();expect(execute(ctx)).toEqual({stdout:[expected],stderr:[]});expect(ctx.document!.view()).toBe(before);
});
it("requires a document without assuming concrete model classes",()=>{
 expect(()=>execute({document:null,rendering:{tree:()=>[],show:()=>[]}})).toThrow("no document. use 'init' or 'read' first");
});
it("rejects arguments before executing a query",()=>{
 expect(()=>new StatsCommand().parse([{value:"extra",quoted:false,column:1}])).toThrow("usage: stats");
});
