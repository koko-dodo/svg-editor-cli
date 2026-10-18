import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import { Editor } from "../../src/services/Editor";
import { Repl } from "../../src/cli/Repl";

let directory: string;
beforeEach(async () => { directory = await fs.mkdtemp(join(tmpdir(), "svg-contract-")); });
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });
async function session(editor: Editor, commands: string[]) {
  const out = new PassThrough(); const err = new PassThrough(); let stdout = ""; let stderr = "";
  out.on("data", chunk => { stdout += chunk; }); err.on("data", chunk => { stderr += chunk; });
  await new Repl(Readable.from([commands.join("\n")]), out, err, false, editor).run();
  return { stdout: stdout.trimEnd().split("\n"), stderr: stderr.trimEnd().split("\n") };
}

describe("experiment §6 complete typical session", () => {
  it("replays edits, reversals, errors, save barrier and hand-authored import", async () => {
    const demo = join(directory, "demo.svg"); const other = join(directory, "other.svg");
    // The external SVG from §6; no production serializer generates this fixture.
    await fs.writeFile(other, `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
      <rect x="0" y="0" width="400" height="300" fill="#ffffff"/>
      <text id="t1" x="10" y="290">imported</text><circle id="c1" cx="50" cy="50" r="10"/>
      <g id="g1"><rect id="r2" x="0" y="0" width="10" height="10"/><circle id="c2" cx="5" cy="5" r="2"/></g>
      <ellipse id="e1" cx="1" cy="2" rx="3" ry="4"/></svg>`);
    const editor = new Editor();
    const result = await session(editor, [
      "init 800 600", "create rect bg 0 0 800 600 #ffffff", 'create text title 20 40 "My Diagram"',
      "create circle c1 100 100 20 red", "create rect box 200 80 60 60 #3366ff", "group markers c1 box", "tree",
      "move c1 30 0", "undo", "redo", 'set title text "My Diagram v2"', "undo",
      "group bad c1 markers", "delete box", "undo", `save "${demo}"`, "undo", `read "${other}"`, "tree",
    ]);
    // Only alignment padding varies from the illustrated transcript; preserve content spaces.
    const alignment = (line: string) => line.replace(/ {2,}/g, " ");
    expect(result.stdout.map(alignment)).toEqual([
      "canvas 800x600 created", "rect#bg created", "text#title created", "circle#c1 created", "rect#box created",
      "g#markers created with 2 children", "svg (800x600)",
      "├── rect#bg x=0 y=0 w=800 h=600 fill=#ffffff", '├── text#title (20,40) "My Diagram"', "└── g#markers",
      " ├── circle#c1 cx=100 cy=100 r=20 fill=red", " └── rect#box x=200 y=80 w=60 h=60 fill=#3366ff",
      "circle#c1 moved to (130,100)", "circle#c1 moved back to (100,100)", "circle#c1 moved to (130,100)",
      'text#title updated: text="My Diagram v2"', 'text#title updated: text="My Diagram"',
      "rect#box deleted", "rect#box restored into g#markers", `saved to ${demo} (5 elements)`,
      `read ${other} (7 elements)`, "svg (400x300)", "├── rect#rect1 x=0 y=0 w=400 h=300 fill=#ffffff",
      '├── text#t1 (10,290) "imported"', "├── circle#c1 cx=50 cy=50 r=10", "├── g#g1",
      "│ ├── rect#r2 x=0 y=0 w=10 h=10", "│ └── circle#c2 cx=5 cy=5 r=2", "└── ellipse#e1 cx=1 cy=2 rx=3 ry=4",
    ].map(alignment));
    expect(result.stderr).toEqual([
      "error: cannot group a container into its own descendant: markers",
      "error: undo not allowed after io command", "warning: assigned id rect1 to unnamed <rect>",
    ]);
    // Saved pre-read state independently proves redo movement, text undo and deletion undo.
    const xml = new DOMParser().parseFromString(await fs.readFile(demo, "utf8"), "application/xml");
    expect(xml.getElementsByTagName("circle").item(0)!.getAttribute("cx")).toBe("130");
    expect(xml.getElementsByTagName("text").item(0)!.textContent).toBe("My Diagram");
    const group = xml.getElementsByTagName("g").item(0)!;
    expect(Array.from(group.childNodes).filter(n => n.nodeType === 1).map(n => (n as import("@xmldom/xmldom").Element).getAttribute("id"))).toEqual(["c1", "box"]);
    expect(editor.getCanvas()).toEqual({ width: 400, height: 300 });
    expect(editor.tree().roots.map(s => s.id)).toEqual(["rect1", "t1", "c1", "g1", "e1"]);
    expect(editor.show("c1").attributes).toEqual({ cx: 50, cy: 50, r: 10 });
    expect(editor.getStatus()).toEqual({ hasDocument: true, canUndo: false, canRedo: false, isBlocked: true });
  });
});

describe("project paint policy + experiment failure/history contract", () => {
  it.each(["rgb(10 20 30 / 50%)", "hsl(120deg 50% 50%)"])("edits, saves and imports %s; rejection retains redo and barrier", async paint => {
    const path = join(directory, "paint.svg"); const editor = new Editor();
    await session(editor, ["init", "create rect r 0 0 10 20", "move r 5 6", "undo"]);
    const before = { tree: editor.tree(), history: editor.getStatus() };
    const failure = await session(editor, ['set r fill "url(https://example.invalid/paint)"']);
    expect(failure.stderr).toEqual(["error: unsupported SVG paint: url(https://example.invalid/paint)"]);
    expect({ tree: editor.tree(), history: editor.getStatus() }).toEqual(before);
    const success = await session(editor, ["redo", `set r fill "${paint}"`, `set r stroke "${paint}"`, `save "${path}"`]);
    expect(success.stderr).toEqual([""]);
    expect(editor.show("r").attributes.x).toBe(5);
    const xml = new DOMParser().parseFromString(await fs.readFile(path, "utf8"), "application/xml");
    const rect = xml.getElementsByTagName("rect").item(0)!;
    expect([rect.getAttribute("fill"), rect.getAttribute("stroke")]).toEqual([paint, paint]);
    const saved = { tree: editor.tree(), history: editor.getStatus() };
    await session(editor, ['set r stroke "var(--paint)"']);
    expect({ tree: editor.tree(), history: editor.getStatus() }).toEqual(saved);
    const reloaded = new Editor(); await reloaded.read(path);
    expect(reloaded.show("r").attributes).toEqual({ x: 5, y: 6, width: 10, height: 20, fill: paint, stroke: paint });
  });
});
