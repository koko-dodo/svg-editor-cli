import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API } from 'typescript/unstable/sync';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import * as ts from 'typescript/unstable/ast';
import { createScanner } from 'typescript/unstable/ast/scanner';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const kinds = names => new Set(names.map(name => ts.SyntaxKind[name]));
const functions = kinds(['FunctionDeclaration','FunctionExpression','ArrowFunction','MethodDeclaration','Constructor','GetAccessor','SetAccessor']);
const decisions = kinds(['IfStatement','ForStatement','ForInStatement','ForOfStatement','WhileStatement','DoStatement','CaseClause','CatchClause','ConditionalExpression']);
const logical = kinds(['AmpersandAmpersandToken','BarBarToken','QuestionQuestionToken','AmpersandAmpersandEqualsToken','BarBarEqualsToken','QuestionQuestionEqualsToken']);
const literals = kinds(['StringLiteral','NoSubstitutionTemplateLiteral','RegularExpressionLiteral','TemplateHead','TemplateMiddle','TemplateTail']);

export function classify(path) {
  if (/(^|\/)(node_modules|dist|out|coverage|tests|test|fixtures)(\/|$)/.test(path) || /\.d\.[cm]?ts$/.test(path)) return undefined;
  if (!/\.[cm]?[jt]sx?$/.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(path)) return undefined;
  if (path.startsWith('vscode-extension/src/')) return 'vscode';
  if (path.startsWith('plugins/')) return 'plugins';
  if (path === 'src/main.ts' || path.startsWith('src/host/')) return 'host';
  if (path.startsWith('src/')) return 'kernel';
  return undefined;
}
function responsibility(path) {
  if (path.startsWith('vscode-extension/')) return 'VSCode providers / independent XML outline';
  if (path.startsWith('plugins/')) return 'Plugin-owned models / grammar / behavior / presentation';
  if (path.startsWith('src/api/')) return 'Public domain and extension contracts';
  if (path.startsWith('src/model/')) return 'Domain structure / invariants / cloning';
  if (path.startsWith('src/commands/')) return 'Domain edit commands / snapshot transactions';
  if (path.startsWith('src/services/')) return 'Application operations / saved baseline / feedback';
  if (path.startsWith('src/extensions/')) return 'Generic registration / lookup / dispatch';
  if (path.startsWith('src/io/')) return 'SVG and filesystem IO';
  if (path.startsWith('src/cli/')) return 'CLI parsing / execution / rendering';
  return 'Host startup / composition / module loading';
}
function runtimeStatement(n) {
  if ([ts.SyntaxKind.InterfaceDeclaration,ts.SyntaxKind.TypeAliasDeclaration,ts.SyntaxKind.EmptyStatement].includes(n.kind)) return false;
  if (n.modifiers?.some(m => m.kind === ts.SyntaxKind.DeclareKeyword)) return false;
  if (ts.isImportDeclaration(n)) {
    const clause = n.importClause, bindings = clause?.namedBindings;
    return !(clause?.phaseModifier === ts.SyntaxKind.TypeKeyword || (clause && !clause.name && bindings && ts.isNamedImports(bindings) && bindings.elements.length && bindings.elements.every(e => e.isTypeOnly)));
  }
  if (ts.isExportDeclaration(n)) {
    return !(n.isTypeOnly || (n.exportClause && ts.isNamedExports(n.exportClause) && n.exportClause.elements.length && n.exportClause.elements.every(e => e.isTypeOnly)));
  }
  return true;
}

/** Analyze parser AST, never regex-count branch words or comments. */
export function analyze(source, file) {
  const scopes = [], protectedRanges = [];
  const module = { name: '<module>', line: 1, complexity: file.statements.some(runtimeStatement) ? 1 : 0 };
  const lineAt = offset => source.slice(0, offset).split('\n').length;
  const visit = (n, scope) => {
    if (literals.has(n.kind)) protectedRanges.push([n.getStart(file), n.end]);
    if (functions.has(n.kind) && n.body) {
      const start = n.getStart(file);
      scope = { name: n.name ? source.slice(n.name.getStart(file), n.name.end) : n.kind === ts.SyntaxKind.Constructor ? 'constructor' : '<anonymous>', line: lineAt(start), complexity: 1 };
      scopes.push(scope);
    }
    if (decisions.has(n.kind) || (ts.isBinaryExpression(n) && logical.has(n.operatorToken.kind))) scope.complexity++;
    n.forEachChild(child => visit(child, scope));
  };
  visit(file, module);
  // Hide literal text before lexing trivia: regex/template contents cannot become fake comments.
  const masked = source.split('');
  for (const [start,end] of protectedRanges) for (let i=start;i<end;i++) if (masked[i] !== '\n' && masked[i] !== '\r') masked[i] = 'x';
  const scanner = createScanner(false, undefined, masked.join(''));
  for (let token=scanner.scan();token!==ts.SyntaxKind.EndOfFile;token=scanner.scan()) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia || token === ts.SyntaxKind.ShebangTrivia) {
      for (let i=scanner.getTokenStart();i<scanner.getTokenEnd();i++) if (masked[i] !== '\n' && masked[i] !== '\r') masked[i] = ' ';
    }
  }
  const lines = source === '' ? [] : source.replace(/\n$/, '').split('\n');
  const codeLines = masked.join('').replace(/\n$/, '').split('\n');
  return { lines: lines.length, nonblank: lines.filter(l=>l.trim()).length, sloc: codeLines.filter(l=>l.trim()).length,
    functions: scopes.length, ccFunctions: scopes.reduce((n,s)=>n+s.complexity,0), ccModule: module.complexity,
    cc: module.complexity + scopes.reduce((n,s)=>n+s.complexity,0), maxFunctionCC: Math.max(0,...scopes.map(s=>s.complexity)), scopes: [module,...scopes] };
}
export function analyzeSources(sources) {
  const virtual = '/metrics', config = virtual + '/tsconfig.json';
  const files = Object.fromEntries(sources.map(({path,source})=>[virtual+'/'+path,source]));
  const compiler = new API({ fs: createVirtualFileSystem({ ...files, [config]: JSON.stringify({compilerOptions:{noLib:true,allowJs:true,checkJs:false},files:Object.keys(files)}) }) });
  try {
    const snapshot = compiler.updateSnapshot({openProjects:[config]});
    try {
      const program = snapshot.getProject(config).program;
      return sources.map(({path,source,...metadata})=>{
        const name = virtual+'/'+path, errors = program.getSyntacticDiagnostics(name);
        if (errors.length) throw new Error(`metrics parse failed: ${path}: ${JSON.stringify(errors)}`);
        return {path,...metadata,...analyze(source,program.getSourceFile(name))};
      });
    } finally {snapshot.dispose();}
  } finally {compiler.close();}
}
function tree(ref) {
  const commit = git('rev-parse','--verify',`${ref}^{commit}`).trim();
  const entries = git('ls-tree','-r','-z',commit).split('\0').filter(Boolean).map(line=>{
    const [info,path]=line.split('\t'),[mode,type,blob]=info.split(' ');return {path,mode,type,blob};
  });
  const sources = entries.filter(e=>classify(e.path)).map(e=>({path:e.path,blob:e.blob,role:classify(e.path),responsibility:responsibility(e.path),source:git('show',`${commit}:${e.path}`)}));
  const files = analyzeSources(sources), totals = {};
  for(const role of ['kernel','host','plugins','vscode']) {
    const selected = files.filter(f=>f.role===role);
    totals[role] = Object.fromEntries(['files','lines','nonblank','sloc','functions','ccFunctions','ccModule','cc'].map(key=>[key,key==='files'?selected.length:selected.reduce((n,f)=>n+f[key],0)]));
  }
  totals.cli = Object.fromEntries(Object.keys(totals.kernel).map(key=>[key,totals.kernel[key]+totals.host[key]+totals.plugins[key]]));
  return {commit,files,totals,entries};
}
export function collect(base='final',target='HEAD',out=resolve(root,'docs/metrics'),freezeScope=false) {
  const before=tree(base),after=tree(target);
  const delta=Object.fromEntries(Object.keys(after.totals).map(role=>[role,Object.fromEntries(Object.keys(after.totals[role]).map(key=>[key,after.totals[role][key]-before.totals[role][key]]))]));
  const version=JSON.parse(readFileSync(resolve(root,'node_modules/typescript/package.json'),'utf8')).version;
  const result={schema:1,analyzer:`TypeScript ${version} native AST + scanner`,baseline:{commit:before.commit,totals:before.totals,files:before.files},current:{commit:after.commit,totals:after.totals,files:after.files},delta};
  mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'metrics.json'),JSON.stringify(result,null,2)+'\n');
  const rows=['# Git 历史指标','',`Baseline: \`${before.commit}\``,`Target: \`${after.commit}\``, '', '由 collect.mjs 生成；口径见 README.md。目标由参数指定，不自动宣称最终验收。','', '| 范围 | 文件 final→target | SLOC final→target (Δ) | CC final→target (Δ) |','|---|---:|---:|---:|'];
  for(const role of Object.keys(after.totals)) {const a=before.totals[role],b=after.totals[role];rows.push(`| ${role} | ${a.files}→${b.files} | ${a.sloc}→${b.sloc} (${delta[role].sloc}) | ${a.cc}→${b.cc} (${delta[role].cc}) |`);}
  for(const [label,data] of [['final',before],['target',after]]) {
    rows.push('',`## ${label} 文件清单与职责`,'','| 文件 | 分类 | 职责 | 行数 | SLOC | CC |','|---|---|---|---:|---:|---:|');
    for(const file of data.files) rows.push(`| ${file.path} | ${file.role} | ${file.responsibility} | ${file.lines} | ${file.sloc} | ${file.cc} |`);
  }
  writeFileSync(resolve(out,'report.md'),rows.join('\n')+'\n');
  const frozen=after.entries.filter(e=>e.path.startsWith('src/')||e.path.startsWith('plugins/')).map(({path,blob})=>({path,blob,policy:path==='src/host/composition.ts'?'code-assembly-only exception':'frozen'}));
  if (freezeScope) writeFileSync(resolve(out,'freeze-scope.json'),JSON.stringify({status:'candidate-awaiting-human-acceptance',sourceCommit:after.commit,files:frozen},null,2)+'\n');
  return result;
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);let base='final',target='HEAD',out=resolve(root,'docs/metrics'),freezeScope=false;
  for(let i=0;i<args.length;i+=2) {if(args[i]==='--freeze-scope'){freezeScope=true;i--;continue;}if(!args[i+1])throw new Error('usage: --base ref --target ref --out directory');if(args[i]==='--base')base=args[i+1];else if(args[i]==='--target')target=args[i+1];else if(args[i]==='--out')out=resolve(args[i+1]);else throw new Error('unknown metrics option');}
  const result=collect(base,target,out,freezeScope);console.log(JSON.stringify({baseline:result.baseline.commit,target:result.current.commit,totals:result.current.totals,delta:result.delta},null,2));
}
