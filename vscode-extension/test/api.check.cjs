// Simulated API contract tests, NOT Extension Development Host/UI tests.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
class EventEmitter {
  listeners = []; disposed = false;
  event = listener => { this.listeners.push(listener); return { dispose: () => { this.listeners = this.listeners.filter(x => x !== listener); } }; };
  fire = value => { for (const listener of this.listeners) listener(value); };
  dispose() { this.disposed = true; this.listeners = []; }
}
class Range { constructor(start, end) { this.start = start; this.end = end; } }
class DocumentSymbol { children = []; constructor(name, detail, kind, range, selectionRange) { Object.assign(this, { name, detail, kind, range, selectionRange }); } }
class FileDecoration { constructor(badge, tooltip) { Object.assign(this, { badge, tooltip }); } }
let watcher, renames, stat, registrations;
const api = {
  EventEmitter, Range, DocumentSymbol, FileDecoration,
  SymbolKind: { Object: 18 }, FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
  workspace: {
    fs: { stat: uri => stat(uri) },
    createFileSystemWatcher: pattern => { assert.equal(pattern, '**/*'); watcher = { disposed: false };
      for (const key of ['Create', 'Delete', 'Change']) { const e = new EventEmitter(); watcher[key] = e; watcher['onDid' + key] = e.event; }
      watcher.dispose = () => { watcher.disposed = true; }; return watcher;
    },
    onDidRenameFiles: listener => renames.event(listener),
  },
  window: { registerFileDecorationProvider: provider => register('decoration', provider) },
  languages: { registerDocumentSymbolProvider: (selector, provider) => { registrations.selector = selector; return register('symbol', provider); } },
};
function register(kind, provider) { registrations[kind] = provider; const d = { disposed: false, dispose() { this.disposed = true; } }; registrations[kind + 'Disposable'] = d; return d; }
const load = Module._load;
Module._load = function(name, ...args) { return name === 'vscode' ? api : load.call(this, name, ...args); };
let SvgFileDecorationProvider, SvgDocumentSymbolProvider, activate;
try {
  ({ SvgFileDecorationProvider } = require('../out/SvgFileDecorationProvider'));
  ({ SvgDocumentSymbolProvider } = require('../out/SvgDocumentSymbolProvider'));
  ({ activate } = require('../out/extension'));
} finally { Module._load = load; }
const token = { isCancellationRequested: false };
const uri = path => ({ path });
beforeEach(() => { renames = new EventEmitter(); registrations = {}; stat = async () => ({ type: 1 }); });

test('only actual SVG files get badges; ordinary files do not even need stat', async () => {
  const provider = new SvgFileDecorationProvider(); let calls = 0;
  stat = async () => { calls++; return { type: 1 }; };
  assert.equal(await provider.provideFileDecoration(uri('/plain.txt'), token), undefined);
  assert.equal(calls, 0);
  const badge = await provider.provideFileDecoration(uri('/a.svg'), token);
  assert.equal(badge.badge, '[]'); assert.equal(badge.propagate, false);
  assert.equal((await provider.provideFileDecoration(uri('/A.SVG'), token)).badge, '[]');
  for (const type of [0, 2, 66]) { stat = async () => ({ type }); assert.equal(await provider.provideFileDecoration(uri('/folder.svg'), token), undefined); }
  provider.dispose();
});
test('missing resources, cancellation and cancellation during stat return no badge', async () => {
  const provider = new SvgFileDecorationProvider();
  stat = async () => { throw new Error('gone'); };
  assert.equal(await provider.provideFileDecoration(uri('/missing.svg'), token), undefined);
  assert.equal(await provider.provideFileDecoration(uri('/a.svg'), { isCancellationRequested: true }), undefined);
  const pending = { isCancellationRequested: false };
  stat = async () => { pending.isCancellationRequested = true; return { type: 1 }; };
  assert.equal(await provider.provideFileDecoration(uri('/a.svg'), pending), undefined);
  provider.dispose();
});
test('create/delete/change/rename refresh and subscriptions are released', () => {
  const provider = new SvgFileDecorationProvider(); let events = 0;
  provider.onDidChangeFileDecorations(() => events++);
  watcher.Create.fire(uri('/new.svg')); watcher.Delete.fire(uri('/old.svg')); watcher.Change.fire(uri('/new.svg'));
  renames.fire({ files: [{ oldUri: uri('/folder'), newUri: uri('/renamed') }] });
  assert.equal(events, 4);
  provider.dispose(); provider.dispose();
  assert(watcher.disposed); assert.equal(renames.listeners.length, 0);
  for (const key of ['Create', 'Delete', 'Change']) assert.equal(watcher[key].listeners.length, 0);
  watcher.Create.fire(uri('/later.svg')); assert.equal(events, 4);
});
function document(text, path = '/example.svg') {
  return { uri: uri(path), version: 1, getText: () => text,
    positionAt(offset) { const prefix = text.slice(0, offset); const lines = prefix.split(/\r\n|\r|\n/); return { line: lines.length - 1, character: lines.at(-1).length }; } };
}
test('symbol adapter maps UTF-16/CRLF ranges, children and selection names', () => {
  const text = '<svg>😀\r\n<g id="中"><text><tspan/></text></g></svg>';
  const provider = new SvgDocumentSymbolProvider();
  const [svg] = provider.provideDocumentSymbols(document(text), token);
  assert.equal(svg.name, 'svg');
  const g = svg.children[0]; assert.equal(g.name, 'g#中');
  assert.deepEqual(g.range.start, { line: 1, character: 0 });
  assert.deepEqual(g.selectionRange.start, { line: 1, character: 1 });
  assert.deepEqual(g.selectionRange.end, { line: 1, character: 2 });
  assert.equal(g.children[0].children[0].name, 'tspan');
  assert.deepEqual(svg.range.end, { line: 1, character: text.split('\r\n')[1].length });
});
test('symbol requests update after edits, isolate invalid XML and filter/cancel', () => {
  const provider = new SvgDocumentSymbolProvider();
  assert.deepEqual(provider.provideDocumentSymbols(document('<svg>'), token), []);
  assert.equal(provider.provideDocumentSymbols(document('<svg>\n<path/></svg>'), token)[0].children[0].range.start.line, 1);
  assert.deepEqual(provider.provideDocumentSymbols(document('<svg/>', '/plain.txt'), token), []);
  assert.deepEqual(provider.provideDocumentSymbols(document('<svg/>'), { isCancellationRequested: true }), []);
});
test('activation registers native providers without opening a document; disposal releases all', () => {
  const context = { subscriptions: [] }; activate(context);
  assert(registrations.decoration instanceof SvgFileDecorationProvider);
  assert(registrations.symbol instanceof SvgDocumentSymbolProvider);
  assert.deepEqual(registrations.selector, [{ pattern: '**/*.svg' }, { pattern: '**/*.SVG' }]);
  assert.equal(context.subscriptions.length, 3);
  for (const d of context.subscriptions) d.dispose();
  assert(watcher.disposed); assert(registrations.decorationDisposable.disposed); assert(registrations.symbolDisposable.disposed);
});
test('manifest and launch point to the compiled activation module and build task', () => {
  const fs = require('node:fs'), path = require('node:path');
  const manifest = require('../package.json');
  assert.equal(manifest.engines.vscode, '^1.85.0');
  assert(manifest.activationEvents.includes('onStartupFinished'));
  assert.equal(typeof require(path.resolve(__dirname, '..', manifest.main)).activate, 'function');
  const launch = JSON.parse(fs.readFileSync(path.join(__dirname, '../.vscode/launch.json')));
  const tasks = JSON.parse(fs.readFileSync(path.join(__dirname, '../.vscode/tasks.json')));
  assert.equal(launch.configurations[0].type, 'extensionHost');
  assert.equal(launch.configurations[0].preLaunchTask, tasks.tasks[0].label);
});
