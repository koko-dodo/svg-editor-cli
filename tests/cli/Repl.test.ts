import { PassThrough, Readable } from "node:stream";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { Editor } from "../../src/services/Editor";
import { Repl } from "../../src/cli/Repl";

async function session(script: string, interactive = false, editor = new Editor()) {
  const input = Readable.from([script]);
  const output = new PassThrough();
  const errors = new PassThrough();
  let stdout = ""; let stderr = "";
  output.on("data", chunk => { stdout += String(chunk); });
  errors.on("data", chunk => { stderr += String(chunk); });
  await new Repl(input, output, errors, interactive, editor).run();
  return { stdout, stderr, editor };
}

describe("Repl", () => {
  it("routes successful output to stdout and errors to stderr, then continues", async () => {
    const { stdout, stderr, editor } = await session([
      "help", "move r 1 2", "init", "create rect r 1 2 3 4", "move r 10 0", "undo",
      "scale r 0", "move r 12px 0", 'create text t 1 2 "unclosed', "redo", "show r", "tree", "",
    ].join("\n"));
    expect(stderr.split("\n").filter(Boolean)).toEqual([
      "error: no document. use 'init' or 'read' first",
      "error: scale factor must be positive",
      'error: invalid number for dx: "12px"',
      "error: unterminated quote at column 19",
    ]);
    expect(stdout).toContain("rect#r moved to (11,2)");
    expect(stdout).toContain("rect#r  parent=svg\n  x=11 y=2 width=3 height=4\n");
    expect(stdout).not.toContain("error:");
    expect(stdout).not.toMatch(/^svg> /m);
    expect(editor.show("r").attributes.x).toBe(11);
    expect(editor.getStatus().canRedo).toBe(false);
  });
  it("preserves document and history through multiple rejected lines", async () => {
    const editor = new Editor(); editor.init();
    editor.create({ type: "rect", id: "r", x: 1, y: 2, width: 3, height: 4 });
    editor.move("r", 10, 20); editor.undo();
    const before = { tree: editor.tree(), history: editor.getStatus() };
    const result = await session('move r 1\nunknown\ncreate g r\nset r width ""\ngroup bad r missing\n', false, editor);
    expect(result.stderr.split("\n").filter(Boolean)).toHaveLength(5);
    expect(result.stdout).toBe("");
    expect({ tree: editor.tree(), history: editor.getStatus() }).toEqual(before);
    editor.redo(); expect(editor.show("r").attributes.x).toBe(11);
  });
  it("keeps a barrier after failures and leaves blank/comment lines silent", async () => {
    const result = await session('\n  # comment\ninit\ncreate circle bad 0 0 -1\nundo\nredo\n');
    expect(result.stdout).toBe("canvas 800x600 created\n");
    expect(result.stderr).toContain("error: r must be non-negative\n");
    expect(result.stderr.match(/error: undo not allowed after io command/g)).toHaveLength(2);
    expect(result.editor.getStatus().isBlocked).toBe(true);
  });
  it("replays the two-node flowchart example without the pending save operation", async () => {
    const result = await session([
      "init 800 600", "create g flowchart", "create g node1 in flowchart",
      "create rect start 120 100 160 60 #4a90d9 in node1",
      'create text start-label 155 135 "开始" in node1', "create g node2 in flowchart",
      "create rect process 520 100 160 60 #f5a623 in node2",
      'create text process-label 545 135 "处理数据" in node2',
      "create line arrow1 280 130 520 130 black in flowchart",
      "tree", "move node2 0 100", "undo", 'set process-label text "处理数据 v2"', "show process-label", "",
    ].join("\n"));
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("rect#start created in g#node1");
    expect(result.stdout).toContain('│   └── text#start-label  (155,135) "开始"');
    expect(result.stdout).toContain("└── line#arrow1  (280,130) -> (520,130)  stroke=black");
    expect(result.stdout).toContain("g#node2 moved back by (0,-100)");
    expect(result.editor.show("process").attributes.y).toBe(100);
    expect(result.editor.show("process-label").attributes.text).toBe("处理数据 v2");
  });
  it("round-trips quoted empty and escaped text", async () => {
    const script = ['init', 'create text empty 1 2 ""', String.raw`create text t 1 2 "a\"b\\c\q"`, 'show empty', 'show t'].join("\n");
    const result = await session(script);
    expect(result.stderr).toBe("");
    expect(result.editor.show("empty").attributes.text).toBe("");
    expect(result.editor.show("t").attributes.text).toBe('a"b\\c\\q');
  });
  it("finishes on EOF without requiring a trailing newline", async () => {
    const result = await session("init 400");
    expect(result.stdout).toBe("canvas 400x600 created\n");
    expect(result.stderr).toBe("");
  });
  it("shows banner and prompt in interactive mode only", async () => {
    const result = await session("init\n", true);
    expect(result.stdout).toContain("svg-editor 0.1 — type 'help' for commands");
    expect(result.stdout).toContain("svg> ");
    expect(result.stdout).toContain("canvas 800x600 created");
    expect(result.stderr).toBe("");
  });
  it("continues after failed IO and retains redo", async () => {
    const result = await session("init\ncreate g g\nundo\nread /missing-svg-test/a.svg\nsave\nredo\n");
    expect(result.stderr).toContain("error: cannot read file: /missing-svg-test/a.svg");
    expect(result.stderr).toContain("error: no default save path");
    expect(result.editor.show("g").id).toBe("g");
  });
  it("runs the actual main entry as a noninteractive process", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/main.ts"], {
      input: "init\ncreate circle c 1 2 3\nscale c 0\nmove c 4 5\nshow c\n", encoding: "utf8", timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("circle#c moved to (5,7)");
    expect(result.stdout).not.toContain("svg>");
    expect(result.stderr).toBe("error: scale factor must be positive\n");
  });
});
