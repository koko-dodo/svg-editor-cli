import { stdin, stdout, stderr } from "node:process";
import { PluginInstaller } from "./host/loading/PluginInstaller";
import { PluginLoader } from "./host/loading/PluginLoader";
import { createEditor, defaultRegistry } from "./host/composition";
import { Repl } from "./cli/Repl";

const registry = defaultRegistry();
const args = process.argv.slice(2);
if (args.length) {
  const errors = args.length === 2 && args[0] === "--config"
    ? new PluginLoader(new PluginInstaller(registry)).loadFile(args[1]!)
    : ["error: invalid plugin config"];
  for (const error of errors) stderr.write(`${error}\n`);
}
void new Repl(stdin, stdout, stderr, Boolean(stdin.isTTY && stdout.isTTY), createEditor(registry)).run().catch(error => {
  stderr.write(`CLI stream failure: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
