import { SaxesParser } from "saxes";

export interface OutlineElement {
  readonly tag: string;
  readonly id: string | undefined;
  readonly start: number;
  readonly nameStart: number;
  readonly nameEnd: number;
  end: number;
  readonly children: OutlineElement[];
}

/** XML validity/hierarchy comes from saxes; offsets use original UTF-16 input. */
export class XmlOutlineParser {
  parse(xml: string, cancelled: () => boolean = () => false): OutlineElement[] {
    const roots: OutlineElement[] = [];
    const stack: OutlineElement[] = [];
    let offset = 0;
    let markupStart = 0;
    let elementStart = 0;
    const parser = new SaxesParser({ xmlns: true });
    parser.on("error", error => { throw error; });
    parser.on("doctype", () => { throw new Error("DTD is not supported"); });
    parser.on("opentagstart", () => { elementStart = markupStart; });
    parser.on("opentag", tag => {
      const id = Object.values(tag.attributes).find(a => a.name === "id" && !a.uri)?.value;
      const node: OutlineElement = {
        tag: tag.name, id, start: elementStart,
        nameStart: elementStart + 1, nameEnd: elementStart + 1 + tag.name.length,
        end: offset, children: [],
      };
      const parent = stack.at(-1);
      (parent ? parent.children : roots).push(node);
      stack.push(node);
    });
    parser.on("closetag", () => { stack.pop()!.end = offset; });
    try {
      // A code-point chunk never splits a surrogate pair. Each SAX event has an
      // exact consumed boundary, even for CRLF, emoji, CDATA and quoted '>'.
      // '<' inside comments/CDATA does not cause opentagstart and is ignored.
      for (const character of xml) {
        if (cancelled()) return [];
        if (character === "<") markupStart = offset;
        offset += character.length;
        parser.write(character);
      }
      parser.close();
      if (roots.length !== 1 || roots[0]!.tag.split(":").at(-1) !== "svg") return [];
      return roots;
    } catch {
      return []; // Discard partial trees; each request uses a fresh parser.
    }
  }
}
