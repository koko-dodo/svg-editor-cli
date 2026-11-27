import * as vscode from "vscode";
import { XmlOutlineParser, type OutlineElement } from "./XmlOutlineParser";

export class SvgDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  constructor(private readonly parser = new XmlOutlineParser()) {}

  provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.DocumentSymbol[] {
    if (!document.uri.path.toLowerCase().endsWith(".svg") || token.isCancellationRequested) return [];
    const version = document.version;
    const nodes = this.parser.parse(document.getText(), () => token.isCancellationRequested);
    if (token.isCancellationRequested || version !== document.version) return [];
    const convert = (node: OutlineElement): vscode.DocumentSymbol => {
      const symbol = new vscode.DocumentSymbol(
        node.id ? `${node.tag}#${node.id}` : node.tag, "", vscode.SymbolKind.Object,
        new vscode.Range(document.positionAt(node.start), document.positionAt(node.end)),
        new vscode.Range(document.positionAt(node.nameStart), document.positionAt(node.nameEnd)),
      );
      symbol.children = node.children.map(convert);
      return symbol;
    };
    return nodes.map(convert);
  }
}
