import * as vscode from 'vscode';

const outputChannel = vscode.window.createOutputChannel('Firebird MCP');

export function log(message: string): void {
  outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
}

export function showOutputChannel(): void {
  outputChannel.show();
}
