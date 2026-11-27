// Real Node+tsx code-composition harness. It never invokes PluginLoader.
const fs = require('node:fs');
const path = require('node:path');
const { defaultRegistry, createEditor } = require('../../src/host/composition.ts');
const { PluginInstaller } = require('../../src/host/loading/PluginInstaller.ts');
const { Repl } = require('../../src/cli/Repl.ts');
const plugin = require('../fixtures/plugins/loader-probe/index.ts');
const metadata = JSON.parse(fs.readFileSync(path.join(__dirname,'../fixtures/plugins/loader-probe/package.json'),'utf8'));
const registry = defaultRegistry();
const errors = new PluginInstaller(registry).installCode([{module:'code-probe',manifest:metadata,exports:plugin,options:JSON.parse(process.argv[2])}]);
for (const error of errors) process.stderr.write(error+'\n');
void new Repl(process.stdin,process.stdout,process.stderr,false,createEditor(registry)).run().catch(error=>{console.error(error);process.exitCode=1;});
