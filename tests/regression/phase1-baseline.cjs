// Read-only verification by default. Golden capture is a separate, guarded action.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const golden = path.join(root, 'doc/transcript/golden');
const finalSha = '177eb20e131849132a777ec0ca576c37a5b00728';
const cases = [
  { name: 'phase1-section6', files: ['demo.svg'] },
  { name: 'phase1-version-a', files: ['flowchart.svg'] },
  { name: 'phase1-compatibility', files: ['copied.svg', 'other.svg'] },
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function runCase(spec, sourceRoot = process.env.SVG_BASELINE_SOURCE_ROOT || root) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'svg-golden-'));
  try {
    fs.copyFileSync(path.join(root, 'tests/fixtures/phase1/other.svg'), path.join(directory, 'other.svg'));
    const input = fs.readFileSync(path.join(root, `doc/transcript/${spec.name}.txt`));
    // JSON argv permits a future Phase 2 entry/config without shell interpolation.
    const argv = process.env.SVG_BASELINE_CLI_JSON
      ? JSON.parse(process.env.SVG_BASELINE_CLI_JSON)
      : [process.execPath, '--import', require.resolve('tsx'), path.join(sourceRoot, 'src/main.ts')];
    assert(Array.isArray(argv) && argv.length && argv.every(x => typeof x === 'string'));
    const result = spawnSync(argv[0], argv.slice(1), {
      cwd: directory, input, timeout: 15000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, TZ: 'UTC', LANG: 'C', LC_ALL: 'C', NO_COLOR: '1', FORCE_COLOR: '0', TSX_DISABLE_CACHE: '1' },
    });
    if (result.error) throw result.error;
    assert.equal(result.signal, null, 'CLI terminated by signal');
    const output = {
      'stdout.txt': result.stdout,
      'stderr.txt': result.stderr,
      'exit-code.txt': Buffer.from(`${result.status}\n`),
    };
    for (const file of spec.files) output[file] = fs.readFileSync(path.join(directory, file));
    return output;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function compare(actual, expected, label) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${label}: artifact names`);
  for (const file of Object.keys(expected)) {
    assert(actual[file].equals(expected[file]), `${label}/${file}: byte mismatch (actual ${actual[file].length}, expected ${expected[file].length})`);
  }
}

function verifyCase(spec) {
  const expected = {};
  for (const file of ['stdout.txt', 'stderr.txt', 'exit-code.txt', ...spec.files]) {
    expected[file] = fs.readFileSync(path.join(golden, spec.name, file));
  }
  compare(runCase(spec), expected, spec.name);
}

function captureFinal() {
  assert(!process.env.SVG_BASELINE_SOURCE_ROOT && !process.env.SVG_BASELINE_CLI_JSON, 'capture cannot use an overridden executable');
  const git = (...args) => execFileSync('git', args, { cwd: root });
  assert.equal(git('rev-parse', 'HEAD').toString().replace(/\n$/, ''), finalSha);
  assert.equal(git('rev-parse', 'final').toString().replace(/\n$/, ''), finalSha);
  // Compare actual bytes, not merely index/diff metadata.
  const protectedPaths = git('ls-tree', '-r', '--name-only', finalSha, 'src', 'package.json', 'package-lock.json', 'tsconfig.json')
    .toString().split('\n').filter(Boolean);
  const hashes = {};
  for (const file of protectedPaths) {
    const bytes = fs.readFileSync(path.join(root, file));
    assert(bytes.equals(git('show', `${finalSha}:${file}`)), `modified baseline source: ${file}`);
    hashes[file] = hash(bytes);
  }
  // mkdir without recursive refuses to overwrite any existing Golden directory.
  fs.mkdirSync(golden);
  for (const spec of cases) {
    const output = runCase(spec);
    fs.mkdirSync(path.join(golden, spec.name));
    for (const [file, bytes] of Object.entries(output)) {
      fs.writeFileSync(path.join(golden, spec.name, file), bytes, { flag: 'wx' });
    }
  }
  const inputs = {};
  for (const spec of cases) {
    const file = `doc/transcript/${spec.name}.txt`;
    inputs[file] = hash(fs.readFileSync(path.join(root, file)));
  }
  inputs['tests/fixtures/phase1/other.svg'] = hash(fs.readFileSync(path.join(root, 'tests/fixtures/phase1/other.svg')));
  const metadata = {
    sourceCommit: finalSha, node: process.version,
    mode: 'noninteractive piped stdin/stdout/stderr; no banner or prompt',
    cwd: 'fresh isolated temporary directory per case; commands use relative paths',
    env: { TZ: 'UTC', LANG: 'C', LC_ALL: 'C', NO_COLOR: '1', FORCE_COLOR: '0', TSX_DISABLE_CACHE: '1' },
    inputs, sourceHashes: hashes,
  };
  fs.writeFileSync(path.join(golden, 'provenance.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
}

module.exports = { cases, compare, verifyCase };
if (require.main === module) {
  if (process.argv.length === 3 && process.argv[2] === '--capture-final') captureFinal();
  else {
    assert.equal(process.argv.length, 2, 'usage: node tests/regression/phase1-baseline.cjs [--capture-final]');
    for (const spec of cases) { verifyCase(spec); console.log(`PASS ${spec.name}`); }
  }
}
