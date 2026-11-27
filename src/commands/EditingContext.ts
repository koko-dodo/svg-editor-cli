import { queryView } from "../model/DocumentView";
import type { DocumentQuery } from "../api/Domain";
import type { AttributeMutation, EditingAction, MutationPort } from "../api/Editing";
import type { SvgDocument } from "../model/SvgDocument";

/** Trusted application adapter. Never exported from the plugin API. */
export function executeScoped(document: SvgDocument, action: EditingAction) {
  let active = true;
  const check = (): void => { if (!active) throw new Error("editing context has expired"); };
  const query = (): DocumentQuery => { check(); return queryView(document.view()); };
  const port: MutationPort = Object.freeze({
    view: () => query().view(),
    find: (id: string) => query().find(id),
    parentId: (id: string) => query().parentId(id),
    addShape: (...args: Parameters<MutationPort["addShape"]>) => { check(); document.addShape(...args); },
    deleteShape: (id: string) => { check(); document.deleteShape(id); },
    move: (id: string, dx: number, dy: number) => { check(); document.move(id, dx, dy); },
    scale: (id: string, factor: number) => { check(); document.scale(id, factor); },
    setDefault: (...args: Parameters<MutationPort["setDefault"]>) => { check(); document.setAttribute(...args); },
    group: (id: string, members: readonly string[]) => { check(); document.group(id, members); },
    ungroup: (id: string) => { check(); document.ungroup(id); },
    addTo: (parentId: string, id: string) => { check(); document.addTo(parentId, id); },
    bringToFront: (id: string) => { check(); document.bringToFront(id); },
    sendToBack: (id: string) => { check(); document.sendToBack(id); },
  });
  try {
    const result = action.execute(port);
    if (result !== null && typeof result === "object" && "then" in result) {
      void Promise.resolve(result).catch(() => {});
      throw new Error("editing action must be synchronous");
    }
    return result;
  }
  finally { active = false; }
}

/** Do not expose additional methods through a narrowed TypeScript assertion. */
export function attributePort(port: MutationPort): AttributeMutation {
  return Object.freeze({ view: port.view, find: port.find, parentId: port.parentId, setDefault: port.setDefault });
}
