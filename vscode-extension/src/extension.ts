import * as vscode from "vscode";
import { SvgFileDecorationProvider } from "./SvgFileDecorationProvider";
import { SvgDocumentSymbolProvider } from "./SvgDocumentSymbolProvider";

export function activate(context: vscode.ExtensionContext): void {
  const decorations = new SvgFileDecorationProvider();
  context.subscriptions.push(decorations,
    vscode.window.registerFileDecorationProvider(decorations),
    vscode.languages.registerDocumentSymbolProvider(
      [{ pattern: "**/*.svg" }, { pattern: "**/*.SVG" }], new SvgDocumentSymbolProvider(),
    ),
  );
}
