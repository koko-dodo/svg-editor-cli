import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { DirectoryPort } from "../../plugins/command-dir/DirectoryPort";
import { DirCommand } from "../../plugins/command-dir/DirCommand";
import { NodeDirectoryAdapter } from "../../plugins/command-dir/NodeDirectoryAdapter";
const directories:string[]=[];
afterEach(async()=>{for(const path of directories.splice(0))await fs.rm(path,{recursive:true,force:true});});
async function directory(){const path=await fs.mkdtemp(join(tmpdir(),"svg-dir-"));directories.push(path);return path;}
async function execute(port:DirectoryPort){const plan=new DirCommand(port).parse([]);if(plan.mode!=="query")throw new Error("not a query");return plan.execute({document:null,rendering:{tree:()=>[],show:()=>[]}});}
it("sorts mock entries by directory then raw name without locale, mutation, recursion or dot entries",async()=>{
 const entries=Object.freeze([{name:"z",directory:false},{name:"a",directory:true},{name:".",directory:true},{name:"A",directory:true},{name:"..",directory:true},{name:".env",directory:false},{name:"Z",directory:false},{name:"line\nfeed",directory:false}].map(e=>Object.freeze(e)));
 const read=vi.fn().mockResolvedValue(entries),port={currentDirectory:()=>"/chosen cwd",read};
 const expected={stdout:["[DIR]  A","[DIR]  a","[FILE]  .env","[FILE]  Z","[FILE]  line\\nfeed","[FILE]  z"],stderr:[]};
 expect(await execute(port)).toEqual(expected);expect(await execute(port)).toEqual(expected);expect(read.mock.calls).toEqual([["/chosen cwd"],["/chosen cwd"]]);expect(entries[0]!.name).toBe("z");
});
it("prints the prescribed empty message",async()=>{expect(await execute({currentDirectory:()=>"/empty",read:async()=>[]})).toEqual({stdout:["(empty directory)"],stderr:[]});});
it("maps adapter read failures to the target path without changing it",async()=>{await expect(execute({currentDirectory:()=>"/unreadable path",read:async()=>{throw new Error("denied")}})).rejects.toThrow("cannot read directory: /unreadable path");});
it("rejects arguments before calling the adapter",()=>{
 const read=vi.fn();expect(()=>new DirCommand({currentDirectory:()=>"/unused",read}).parse([{value:"path",quoted:false,column:1}])).toThrow("usage: dir");expect(read).not.toHaveBeenCalled();
});
it("combines the command with real Dirent IO, including hidden files, links, broken links and no recursion",async()=>{
 const path=await directory();await fs.mkdir(join(path,"directory"));await fs.writeFile(join(path,"directory/inside.txt"),"inside");await fs.writeFile(join(path,".hidden"),"");await fs.writeFile(join(path,"file.txt"),"");
 await fs.symlink(join(path,"directory"),join(path,"link-dir"));await fs.symlink(join(path,"file.txt"),join(path,"link-file"));await fs.symlink(join(path,"missing"),join(path,"broken"));
 const adapter=new NodeDirectoryAdapter(()=>path);expect(await execute(adapter)).toEqual({stdout:["[DIR]  directory","[FILE]  .hidden","[FILE]  broken","[FILE]  file.txt","[FILE]  link-dir","[FILE]  link-file"],stderr:[]});
 expect(new NodeDirectoryAdapter().currentDirectory()).toBe(process.cwd());
});
it("handles empty and unavailable real directories",async()=>{
 const path=await directory();expect(await execute(new NodeDirectoryAdapter(()=>path))).toEqual({stdout:["(empty directory)"],stderr:[]});
 await expect(execute(new NodeDirectoryAdapter(()=>join(path,"absent")))).rejects.toThrow(`cannot read directory: ${join(path,"absent")}`);
});
