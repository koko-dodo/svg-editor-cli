// Read-only Git operations; all execution and patching take place in owned temp directories.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { compare } = require('../regression/phase1-baseline.cjs');
const root = path.resolve(__dirname, '../..');
const expectedRoot = path.join(root, 'doc/transcript/acceptance/expected');
const packages = ['command-stats', 'command-dir', 'shape-box', 'tree-star'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
const text = bytes => bytes.toString().replace(/\n$/, '');
function tree(ref, ...paths) {
  return new Map(git('ls-tree', '-r', '-z', ref, '--', ...paths).toString().split('\0').filter(Boolean).map(row => {
    const [metadata, file] = row.split('\t'); return [file, metadata.split(' ')[2]];
  }));
}
function unchanged(before, after, label) {
  assert(before.size, `${label}: empty source scope`);
  for (const [file, hash] of before) assert.equal(after.get(file), hash, `${label}: ${file}`);
  const previousPackages = new Set([...before.keys()].filter(file => file.startsWith('plugins/')).map(file => file.split('/')[1]));
  for (const file of after.keys()) {
    if (file.startsWith('plugins/') && previousPackages.has(file.split('/')[1]))
      assert(before.has(file), `${label}: added file inside existing plugin: ${file}`);
  }
}
function freezeEvidence(head, freeze) {
  const runtime = tree(freeze, 'src', 'plugins');
  unchanged(runtime, tree(head, 'src', 'plugins'), 'freeze tracked scope');
  assert.deepEqual([...tree(freeze, 'src')], [...tree(head, 'src')], 'no new/deleted/changed core paths');
  const commits = text(git('rev-list', '--reverse', `${freeze}..${head}`, '--', 'plugins')).split('\n').filter(Boolean);
  const history = commits.map(commit => {
    const parent = `${commit}^`;
    unchanged(tree(parent, 'src', 'plugins'), tree(commit, 'src', 'plugins'), `existing runtime at ${commit}`);
    assert.deepEqual([...tree(parent, 'src')], [...tree(commit, 'src')], `core path set at ${commit}`);
    return { commit, parent: text(git('rev-parse', parent)), changes: git('diff', '--name-status', parent, commit).toString() };
  });
  // Include working-tree bytes and untracked paths: an empty Git diff alone is insufficient.
  const current = tree(head, 'src', 'plugins');
  for (const [file, hash] of current) {
    const bytes = fs.readFileSync(path.join(root, file));
    const blob = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
    assert.equal(blob, hash, `working runtime: ${file}`);
  }
  assert.equal(git('ls-files', '--others', '--exclude-standard', '--', 'src', 'plugins').length, 0, 'untracked frozen runtime');
  return { freeze, preservedFreezeFiles: runtime.size, checkedCurrentRuntimeFiles: current.size, pluginHistory: history };
}
function exportTree(ref, directory) {
  fs.mkdirSync(directory);
  execFileSync('tar', ['-xf', '-', '-C', directory], { input: git('archive', ref) });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
  const extensionModules = path.join(root, 'vscode-extension/node_modules');
  if (fs.existsSync(path.join(directory, 'vscode-extension')) && fs.existsSync(extensionModules))
    fs.symlinkSync(extensionModules, path.join(directory, 'vscode-extension/node_modules'), 'dir');
}
function runAcceptance({ capture = false, aRef, bRef } = {}) {
  assert.equal(Boolean(aRef), Boolean(bRef), 'supply both --a-ref and --b-ref');
  if (capture) assert(!fs.existsSync(expectedRoot), 'capture refuses existing expectations');
  const head = text(git('rev-parse', 'HEAD')), freeze = text(git('rev-parse', 'kernel-freeze^{commit}'));
  const final = text(git('rev-parse', 'final^{commit}'));
  assert.equal(final, '177eb20e131849132a777ec0ca576c37a5b00728');
  execFileSync('git', ['merge-base', '--is-ancestor', freeze, head], { cwd: root });
  const frozen = freezeEvidence(head, freeze);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'svg-assembly-'));
  try {
    const a = path.join(temp, 'A'), b = path.join(temp, 'B'), old = path.join(temp, 'final'), cwd = path.join(temp, 'cwd');
    exportTree(aRef || head, a); exportTree(bRef || head, b); exportTree(final, old);
    const codePatch = fs.readFileSync(path.join(__dirname, 'code-assembly.patch'));
    if (!aRef) execFileSync('patch', ['--batch', '--forward', '-p1', '-i', path.join(__dirname, 'code-assembly.patch')], { cwd: a });
    const plan = JSON.parse(fs.readFileSync(path.join(root, 'doc/transcript/acceptance/plugins-ab.config.json'), 'utf8'));
    assert.deepEqual(plan.plugins, packages.map(name => ({ module: `./plugins/${name}`, options: {} })));
    const bConfig = path.join(b, 'plugins.config.json');
    if (!bRef) fs.writeFileSync(bConfig, JSON.stringify(plan, null, 2) + '\n');
    else assert.deepEqual(JSON.parse(fs.readFileSync(bConfig, 'utf8')), plan);
    const pluginHashes = {};
    for (const name of packages) {
      const files = tree(head, `plugins/${name}`); assert(files.size, `missing plugin ${name}`);
      for (const file of files.keys()) {
        const expected = fs.readFileSync(path.join(root, file));
        for (const source of [a, b]) assert(fs.readFileSync(path.join(source, file)).equals(expected), `plugin differs: ${file}`);
        pluginHashes[file] = sha256(expected);
      }
    }
    const commitProof = [];
    if (aRef) {
      for (const [mode, ref] of [['A', aRef], ['B', bRef]]) {
        const commit = text(git('rev-parse', `${ref}^{commit}`)), parent = text(git('rev-parse', `${commit}^`));
        assert.equal(parent, freeze, 'demo commits must independently start at kernel-freeze');
        const before = tree(parent, 'src', 'plugins'), after = tree(commit, 'src', 'plugins');
        if (mode === 'A') before.delete('src/host/composition.ts');
        unchanged(before, after, `${mode} commit runtime`);
        // No added core files are permitted either.
        for (const file of after.keys()) assert(before.has(file) || (mode === 'A' && file === 'src/host/composition.ts') || packages.some(name => file.startsWith(`plugins/${name}/`)), `${mode} unexpected runtime addition: ${file}`);
        commitProof.push({ mode, commit, parent, changes: git('diff', '--name-status', parent, commit).toString() });
      }
    }
    const builds = [];
    for (const source of [a, b]) {
      execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', path.join(source, 'tsconfig.json')], { cwd: source, encoding: 'utf8' });
      builds.push(path.basename(source));
    }
    const disabled = path.join(b, 'disabled.acceptance.json');
    fs.writeFileSync(disabled, JSON.stringify({ plugins: plan.plugins.map(p => ({ ...p, enabled: false })) }));
    const reset = () => {
      fs.rmSync(cwd, { recursive: true, force: true }); fs.mkdirSync(cwd);
      for (const folder of ['.hidden-dir', 'A-dir', 'z-dir']) fs.mkdirSync(path.join(cwd, folder));
      for (const file of ['.hidden', 'A.txt', 'z.txt']) fs.writeFileSync(path.join(cwd, file), `${file}\n`);
      fs.copyFileSync(path.join(root, 'tests/fixtures/phase1/other.svg'), path.join(cwd, 'other.svg'));
    };
    const execute = (source, config, input, files) => {
      reset();
      const result = spawnSync(process.execPath, ['--import', require.resolve('tsx'), path.join(source, 'src/main.ts'), ...(config ? ['--config', config] : [])], {
        cwd, input, timeout: 15000, maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, TZ: 'UTC', LANG: 'C', LC_ALL: 'C', NO_COLOR: '1', FORCE_COLOR: '0', TSX_DISABLE_CACHE: '1' },
      });
      if (result.error) throw result.error;
      assert.equal(result.signal, null); assert.equal(result.status, 0);
      const output = { 'stdout.txt': result.stdout, 'stderr.txt': result.stderr, 'exit-code.txt': Buffer.from(`${result.status}\n`) };
      for (const file of files) output[file] = fs.readFileSync(path.join(cwd, file));
      return output;
    };
    const results = [];
    const specs = [
      { name: 'section6', input: 'doc/transcript/phase1-section6.txt', files: ['demo.svg'] },
      { name: 'box', input: 'doc/transcript/box-version-b.txt', files: ['flowchart-box.svg'] },
      { name: 'commands', input: 'doc/transcript/acceptance/commands.txt', files: ['stats.svg'] },
    ];
    if (capture) fs.mkdirSync(expectedRoot);
    for (const spec of specs) {
      const input = fs.readFileSync(path.join(root, spec.input));
      const left = execute(a, undefined, input, spec.files), right = execute(b, bConfig, input, spec.files);
      compare(left, right, `A/B ${spec.name}`);
      const directory = path.join(expectedRoot, spec.name);
      const expectedFile = file => spec.name === 'section6' && file === 'demo.svg'
        ? path.join(root, 'doc/transcript/golden/phase1-section6/demo.svg') : path.join(directory, file);
      if (capture) { fs.mkdirSync(directory); for (const [file, bytes] of Object.entries(left)) if (!(spec.name === 'section6' && file === 'demo.svg')) fs.writeFileSync(expectedFile(file), bytes, { flag: 'wx' }); }
      const expected = Object.fromEntries(Object.keys(left).map(file => [file, fs.readFileSync(expectedFile(file))]));
      compare(right, expected, `expected ${spec.name}`);
      if (spec.name === 'box') assert(left['stdout.txt'].includes(Buffer.from('g#n1 (box) *')), 'missing combined tags');
      results.push({ name: spec.name, input: spec.input, inputSHA256: sha256(input), artifacts: Object.fromEntries(Object.entries(left).map(([file, bytes]) => [file, { bytes: bytes.length, sha256: sha256(bytes) }])) });
    }
    const compatibility = [];
    for (const spec of [
      { name: 'phase1-section6', files: ['demo.svg'] }, { name: 'phase1-version-a', files: ['flowchart.svg'] },
      { name: 'phase1-compatibility', files: ['copied.svg', 'other.svg'] },
    ]) {
      const input = fs.readFileSync(path.join(root, `doc/transcript/${spec.name}.txt`));
      const actualFinal = execute(old, undefined, input, spec.files), current = execute(b, disabled, input, spec.files);
      compare(current, actualFinal, `disabled/final ${spec.name}`);
      const golden = Object.fromEntries(Object.keys(current).map(file => [file, fs.readFileSync(path.join(root, 'doc/transcript/golden', spec.name, file))]));
      compare(actualFinal, golden, `real final ${spec.name}`);
      compatibility.push(spec.name);
    }
    return { sourceCommit: head, node: process.version, final, frozen, assemblyMode: aRef ? 'actual-independent-Git-commits' : 'isolated-Git-export-with-code-assembly-patch',
      actualABCommitProof: aRef ? commitProof : 'PENDING: developer must create A/B demonstration commits',
      options: {}, order: packages, pluginHashes, codePatchSHA256: sha256(codePatch), builds, results, compatibility,
      conditions: 'same absolute cwd reset before each run; identical seeds, stdin and environment; logs outside cwd; raw stdout/stderr/exit/SVG byte comparison; no normalization' };
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
module.exports = { runAcceptance };
if (require.main === module) {
  const args = process.argv.slice(2), options = {}; let report;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--capture') options.capture = true;
    else if (arg === '--a-ref' || arg === '--b-ref') { const value = args.shift(); assert(value); options[arg === '--a-ref' ? 'aRef' : 'bRef'] = value; }
    else if (arg === '--report') { report = args.shift(); assert(report); assert(!fs.existsSync(report), 'report refuses overwrite'); }
    else throw new Error(`unknown argument: ${arg}`);
  }
  const result = runAcceptance(options);
  if (report) fs.writeFileSync(report, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(`PASS A/B: ${result.results.map(r => r.name).join(', ')}; disabled/final: ${result.compatibility.length}; frozen: ${result.frozen.preservedFreezeFiles} files`);
  console.log(result.actualABCommitProof === 'PENDING: developer must create A/B demonstration commits' ? result.actualABCommitProof : 'PASS actual A/B commit diffs');
}
