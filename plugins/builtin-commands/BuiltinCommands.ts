import { parseNumberToken } from "../../src/api";
import type { CommandInvocation, CommandToken as Token, CommandResult, CommandParameter, DocumentQuery, ExtensionOutput, RegistrationContext, ShapeServices, ShapeView } from "../../src/api";
import type { ParsedCommand } from "./Requests";
import { BuiltinCommand } from "./BuiltinCommand";
import type { Feedback } from "./BuiltinCommand";
type Name = ParsedCommand["kind"];
type Request<K extends Name> = Extract<ParsedCommand, { kind: K }>;
const Tokenizer = { number: parseNumberToken };
const out = (stdout: readonly string[]): ExtensionOutput => ({ stdout, stderr: [] });
function result(operation: CommandResult["operation"], id: string, parameters: Record<string, CommandParameter> = {}): CommandResult {
  return { operation, targetIds: [id], parameters };
}
function required(query: DocumentQuery | null): DocumentQuery {
  if (!query) throw new Error("no document. use 'init' or 'read' first");
  return query;
}

export class BuiltinCommands {
 constructor(private readonly context:RegistrationContext) {
    this.register("init", "init [w] [h]", args => {
      this.arity(args, 0, 2, "init [w] [h]");
      return { kind: "init", width: args[0] ? Tokenizer.number(args[0], "width") : 800, height: args[1] ? Tokenizer.number(args[1], "height") : 600 };
    }, (c) => ({ mode: "host", capability: "initialize", execute: p => { const size = p.initialize(c.width,c.height); return out([`canvas ${size.width}x${size.height} created`]); } }));
    this.register("canvas", "canvas [w h]", args => {
      if (args.length !== 0 && args.length !== 2) throw new Error("usage: canvas [w h]");
      return { kind: "canvas", size: args.length === 0 ? null : { width: Tokenizer.number(args[0]!, "width"), height: Tokenizer.number(args[1]!, "height") } };
    }, c => c.size === null ? { mode: "host", capability: "canvas", execute: p => { const s=p.canvas(); return out([`canvas ${s.width}x${s.height}`]); } } : { mode: "host", capability: "resize", execute: p => { const s=p.resize(c.size!.width,c.size!.height); return out([`canvas ${s.width}x${s.height} resized`]); } });
    this.register("create", "create <type> <id> [params...] [in <containerId>]",
      (args, shapes) => { if (args.length < 2) throw new Error("usage: create <type> <id> [params...] [in <containerId>]");
      const type=args[0]!.value; let parsed; try {parsed=shapes.parseCreate(type,args.slice(2));} catch(error) { if (error instanceof Error && error.message === `unknown shape: ${type}`) throw new Error(`unknown shape type: ${type} (is the plugin loaded?)`);throw error;}
      return {kind:"create",request:{type,id:args[1]!.value,...parsed.parameters,...(parsed.parentId===undefined?{}:{parentId:parsed.parentId})} as Request<"create">["request"]}; }, c => ({ mode: "edit", execute: p => { const {type,id,parentId,...parameters}=c.request; p.document.addShape(p.shapes.create(type,id,Object.fromEntries(Object.entries(parameters).filter((entry): entry is [string, string | number] => entry[1] !== undefined))),parentId); return result("create",id); } }), context => {
        const shape = this.target(context);
        return context.direction === "undo" ? `${context.formatter.label(shape)} deleted`
          : `${context.formatter.label(shape)} created${shape.parentId === null ? "" : ` in ${context.formatter.parent(shape)}`}`;
      });
    this.register("delete", "delete <id>", args => ({ kind: "delete", id: this.id(args, "delete <id>") }), c => ({mode:"edit", execute:p=>{p.document.deleteShape(c.id);return result("delete",c.id);}}), context => {
        const shape = this.target(context);
        return `${context.formatter.label(shape)} ${context.direction === "undo" ? `restored into ${context.formatter.parent(shape)}` : "deleted"}`;
      });
    this.register("move", "move <id> <dx> <dy>", args => {
      this.arity(args, 3, 3, "move <id> <dx> <dy>");
      return { kind: "move", id: args[0]!.value, dx: Tokenizer.number(args[1]!, "dx"), dy: Tokenizer.number(args[2]!, "dy") };
    }, c => ({mode:"edit", execute:p=>{p.document.move(c.id,c.dx,c.dy);return result("move",c.id,{dx:c.dx,dy:c.dy});}}), context => {
      const shape = this.target(context);
      const position = context.formatter.position(shape);
      const backward = context.direction === "undo";
      const dx = Number(context.result.parameters.dx) * (backward ? -1 : 1);
      const dy = Number(context.result.parameters.dy) * (backward ? -1 : 1);
      return `${context.formatter.label(shape)} moved${backward ? " back" : ""} ${position === null ? `by (${dx},${dy})` : `to ${position}`}`;
    });
    this.register("scale", "scale <id> <factor>", args => {
      this.arity(args, 2, 2, "scale <id> <factor>");
      return { kind: "scale", id: args[0]!.value, factor: Tokenizer.number(args[1]!, "factor") };
    }, c => ({mode:"edit", execute:p=>{p.document.scale(c.id,c.factor);return result("scale",c.id,{factor:c.factor});}}), context => {
      const label = context.formatter.label(this.target(context));
      return context.direction === "undo" ? `${label} scale undone; geometry restored` : `${label} scaled by ${context.result.parameters.factor}`;
    });
    this.register("set", "set <id> <attr> <value>", args => {
      this.arity(args, 3, 3, "set <id> <attr> <value>");
      return { kind: "set", id: args[0]!.value, attribute: args[1]!.value, value: args[2]!.value };
    }, c => ({mode:"edit", execute:p=>p.setAttribute({targetId:c.id,name:c.attribute,value:c.value})}), context => {
      const shape = this.target(context);
      const name = String(context.result.parameters.name);
      const value = context.shapes!.readAttribute(shape, name);
      return `${context.formatter.label(shape)} updated: ${name}=${value === undefined ? "<unset>" : context.formatter.value(value)}`;
    });
    this.register("group", "group <newGid> <id1> [id2 ...]", args => {
      this.arity(args, 2, Infinity, "group <newGid> <id1> [id2 ...]");
      return { kind: "group", id: args[0]!.value, members: args.slice(1).map(token => token.value) };
    }, c => ({mode:"edit", execute:p=>{p.document.group(c.id,c.members);return result("group",c.id,{members:c.members});}}), context => {
      const shape = this.target(context);
      return context.direction === "undo" ? `${context.formatter.label(shape)} grouping undone; original parents and order restored`
        : `${context.formatter.label(shape)} created with ${shape.children.length} children`;
    });
    this.register("ungroup", "ungroup <gid>", args => ({ kind: "ungroup", id: this.id(args, "ungroup <gid>") }), c => ({mode:"edit", execute:p=>{p.document.ungroup(c.id);return result("ungroup",c.id);}}), context => {
        const shape = this.target(context);
        return context.direction === "undo" ? `${context.formatter.label(shape)} restored into ${context.formatter.parent(shape)} with ${shape.children.length} children`
          : `${context.formatter.label(shape)} ungrouped`;
      });
    this.register("addto", "addto <gid> <id>", args => {
      this.arity(args, 2, 2, "addto <gid> <id>");
      return { kind: "addto", groupId: args[0]!.value, id: args[1]!.value };
    }, c => ({mode:"edit", execute:p=>{p.document.addTo(c.groupId,c.id);return result("addto",c.id,{groupId:c.groupId});}}), context => {
      const shape = this.target(context);
      return `${context.formatter.label(shape)} ${context.direction === "undo" ? "restored" : "moved"} into ${context.formatter.parent(shape)}`;
    });
    this.register("front", "front <id>", args => ({ kind: "front", id: this.id(args, "front <id>") }), c => ({mode:"edit", execute:p=>{p.document.bringToFront(c.id);return result("front",c.id);}}), context => this.orderFeedback(context, "front"));
    this.register("back", "back <id>", args => ({ kind: "back", id: this.id(args, "back <id>") }), c => ({mode:"edit", execute:p=>{p.document.sendToBack(c.id);return result("back",c.id);}}), context => this.orderFeedback(context, "back"));
    this.register("tree", "tree [id]", args => {
      this.arity(args, 0, 1, "tree [id]"); return { kind: "tree", id: args[0]?.value };
    }, c => ({mode:"query", execute:p=>out(p.rendering.tree(required(p.document).view(),c.id))}));
    this.register("show", "show <id>", args => ({ kind: "show", id: this.id(args, "show <id>") }), c => ({mode:"query", execute:p=>{const node=required(p.document).find(c.id);if(!node)throw new Error(`no such shape: ${c.id}`);return out(p.rendering.show(node));}}));
    this.register("help", "help", args => {
      this.arity(args, 0, 0, "help"); return { kind: "help" };
    }, _c => ({mode:"query",execute:p=>out(p.help!())}));
    this.register("undo", "undo", args => {
      this.arity(args, 0, 0, "undo"); return { kind: "undo" };
    }, _c => ({mode:"host",capability:"undo",execute:p=>out(p.undo().feedback)}));
    this.register("redo", "redo", args => {
      this.arity(args, 0, 0, "redo"); return { kind: "redo" };
    }, _c => ({mode:"host",capability:"redo",execute:p=>out(p.redo().feedback)}));
    this.register("read", "read <file.svg>", args => ({ kind: "read", path: this.id(args, "read <file.svg>") }), c => ({mode:"host",capability:"read",execute:async p=>{const r=await p.read(c.path);return {stdout:[`read ${JSON.stringify(r.path).slice(1,-1)} (${r.elements} elements)`],stderr:r.warnings.map(w=>`warning: assigned id ${w.id} to unnamed <${w.tag}>`)};}}));
    this.register("save", "save [file.svg]", args => {
      this.arity(args, 0, 1, "save [file.svg]"); return { kind: "save", path: args[0]?.value };
    }, c => ({mode:"host",capability:"save",execute:async p=>{const r=await p.save(c.path);return out([`saved to ${JSON.stringify(r.path).slice(1,-1)} (${r.elements} elements)`]);}}));
  }
 private register<K extends Name>(name:K,syntax:string,parse:(args:readonly Token[],shapes:ShapeServices)=>Request<K>,plan:(request:Request<K>)=>CommandInvocation,describe?:(context:Feedback)=>string):void{
  this.context.registerCommand(new BuiltinCommand(name,syntax,parse,plan,describe));
 }
 private arity(args:readonly Token[],min:number,max:number,syntax:string):void{if(args.length<min||args.length>max)throw new Error(`usage: ${syntax}`);}
 private id(args:readonly Token[],syntax:string):string{this.arity(args,1,1,syntax);return args[0]!.value;}
 private target(context:Feedback):ShapeView{const id=context.result.targetIds[0]!;const s=context.formatter.find(context.after,id)??context.formatter.find(context.before,id);if(!s)throw new Error(`missing feedback target: ${id}`);return s;}
 private orderFeedback(context:Feedback,direction:string):string{return `${context.formatter.label(this.target(context))} ${context.direction==="undo"?"z-order restored":`moved to ${direction}`}`;}
}
