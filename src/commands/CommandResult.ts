export type CommandOperation =
  | "create" | "delete" | "move" | "scale" | "set"
  | "group" | "ungroup" | "addto" | "front" | "back";

export type CommandParameter = string | number | readonly string[];

/** Plain values only. History copies and freezes results before committing. */
export interface CommandResult {
  readonly operation: CommandOperation;
  readonly targetIds: readonly string[];
  readonly parameters: Readonly<Record<string, CommandParameter>>;
}
