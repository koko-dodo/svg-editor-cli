import type { SvgDocument } from "../model/SvgDocument";
import type { DocumentView } from "../api/Domain";
export type { DocumentView, ShapeView } from "../api/Domain";

/** Compatibility entry point for the existing command/application API. */
export class DocumentViewBuilder {
  static capture(document: SvgDocument): DocumentView { return document.view(); }
}
