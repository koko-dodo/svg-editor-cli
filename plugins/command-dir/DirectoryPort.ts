/** Target abstraction: one direct directory listing, without following links. */
export interface DirectoryEntry {
  readonly name: string;
  readonly directory: boolean;
}
export interface DirectoryPort {
  currentDirectory(): string;
  read(path: string): Promise<readonly DirectoryEntry[]>;
}
