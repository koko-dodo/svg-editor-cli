import { stdin, stdout, stderr } from "node:process";
import { Repl } from "./cli/Repl";

void new Repl(stdin, stdout, stderr, Boolean(stdin.isTTY && stdout.isTTY)).run().catch(error => {
  stderr.write(`CLI stream failure: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
