import { describe, expect, it } from "vitest";
import { Editor } from "../../src/services/Editor";
import { Formatter } from "../../src/cli/Formatter";

function fixture(): Editor {
  const editor = new Editor();
  editor.init();
  editor.create({ type: "rect", id: "bg", x: 0, y: 0, width: 800, height: 600, fill: "#ffffff" });
  editor.create({ type: "text", id: "title", x: 20, y: 40, text: "My Diagram" });
  editor.create({ type: "g", id: "markers" });
  editor.create({ type: "circle", id: "c1", cx: 100, cy: 100, r: 20, fill: "red", parentId: "markers" });
  editor.create({ type: "rect", id: "box", x: 200, y: 80, width: 60, height: 60, fill: "#3366ff", parentId: "markers" });
  return editor;
}

describe("Formatter", () => {
  it("renders ordered trees with geometry, text and style", () => {
    const formatter = new Formatter();
    expect(formatter.tree(fixture().tree())).toEqual([
      "svg (800x600)",
      "├── rect#bg  x=0 y=0 w=800 h=600  fill=#ffffff",
      '├── text#title  (20,40) "My Diagram"',
      "└── g#markers",
      "    ├── circle#c1  cx=100 cy=100 r=20  fill=red",
      "    └── rect#box  x=200 y=80 w=60 h=60  fill=#3366ff",
    ]);
  });
  it("renders only the requested subtree and correct show parent", () => {
    const editor = fixture();
    const formatter = new Formatter();
    expect(formatter.tree(editor.tree("markers"))[0]).toBe("g#markers");
    expect(formatter.show(editor.show("c1"))).toEqual(["circle#c1  parent=g#markers", "  cx=100 cy=100 r=20", "  fill=red"]);
    expect(formatter.show(editor.show("bg"))[0]).toBe("rect#bg  parent=svg");
  });
  it("maintains vertical connectors across nested siblings", () => {
    const editor = fixture();
    editor.create({ type: "g", id: "after" });
    const lines = new Formatter().tree(editor.tree());
    expect(lines).toContain("│   ├── circle#c1  cx=100 cy=100 r=20  fill=red");
    expect(lines.at(-1)).toBe("└── g#after");
  });
  it("renders ellipse and line without exposing class names", () => {
    const editor = new Editor(); editor.init();
    editor.create({ type: "ellipse", id: "e", cx: 1, cy: 2, rx: 3, ry: 4 });
    editor.create({ type: "line", id: "l", x1: 1, y1: 2, x2: 3, y2: 4, stroke: "black" });
    expect(new Formatter().tree(editor.tree())).toEqual([
      "svg (800x600)", "├── ellipse#e  cx=1 cy=2 rx=3 ry=4", "└── line#l  (1,2) -> (3,4)  stroke=black",
    ]);
  });
  it("preserves error text except escaping line breaks", () => {
    expect(new Formatter().error(new Error("no such shape: r9"))).toBe("error: no such shape: r9");
    expect(new Formatter().error(new Error("bad\nnext\rline"))).toBe("error: bad\\nnext\\rline");
  });
});
