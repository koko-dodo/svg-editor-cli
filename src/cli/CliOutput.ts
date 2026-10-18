/** Synchronous edit feedback or asynchronous IO output, with explicit streams. */
export interface CliOutput {
  readonly stdout: readonly string[];
  readonly stderr: readonly string[];
}
export type CliExecution = string[] | Promise<CliOutput>;
