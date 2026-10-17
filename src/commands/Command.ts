import type { SvgDocument } from "../model/SvgDocument";
import type { CommandResult } from "./CommandResult";

/** Synchronous editing only; no IO, history manipulation, or retained document. */
export interface Command {
  execute(document: SvgDocument): CommandResult;
}
