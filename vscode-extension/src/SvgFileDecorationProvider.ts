import * as vscode from "vscode";

export class SvgFileDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
  private readonly changes = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this.changes.event;
  private readonly resources: vscode.Disposable[] = [];
  private disposed = false;

  constructor() {
    // No workspace index/cache. Refresh globally after directory renames too:
    // moved SVG descendants need invalidation even if the folder has no suffix.
    const watcher = vscode.workspace.createFileSystemWatcher("**/*");
    const refresh = () => { if (!this.disposed) this.changes.fire(undefined); };
    this.resources.push(watcher, watcher.onDidCreate(refresh), watcher.onDidDelete(refresh), watcher.onDidChange(refresh));
    this.resources.push(vscode.workspace.onDidRenameFiles(refresh));
  }

  async provideFileDecoration(uri: vscode.Uri, token: vscode.CancellationToken): Promise<vscode.FileDecoration | undefined> {
    if (this.disposed || token.isCancellationRequested || !uri.path.toLowerCase().endsWith(".svg")) return undefined;
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (this.disposed || token.isCancellationRequested) return undefined;
      if (!(stat.type & vscode.FileType.File) || (stat.type & vscode.FileType.Directory)) return undefined;
      const decoration = new vscode.FileDecoration("[]", "SVG file");
      decoration.propagate = false;
      return decoration;
    } catch { return undefined; } // Deleted/unavailable resources have no badge.
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const resource of this.resources) resource.dispose();
    this.changes.dispose();
  }
}
