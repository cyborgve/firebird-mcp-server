import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionConfig } from './vscode/extension-types';
import {
  ConnectionProbeResult,
  McpProcessManager,
  McpProcessState,
} from './vscode/mcp-process-manager';
import { SecretStore } from './vscode/secret-store';
import { showOutputChannel } from './vscode/output-channel';

let manager: McpProcessManager;
let secretStore: SecretStore;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('Firebird MCP');
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'firebirdMcp.serverStatus';
  statusBarItem.show();
  manager = new McpProcessManager(outputChannel, {
    serverScriptPath: path.join(context.extensionPath, 'dist', 'server.js'),
    workingDirectory: context.extensionPath,
  });
  secretStore = new SecretStore(context.secrets);
  updateStatusIndicator(manager.getState());

  context.subscriptions.push(
    statusBarItem,
    manager.onStateChanged((state) => updateStatusIndicator(state)),
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('firebirdMcp.startServer', async () => {
      const config = getExtensionConfig();
      const password = await secretStore.getPassword();
      if (!password) {
        vscode.window.showErrorMessage(
          'Password not set. Use "Set Firebird Password" command first.',
        );
        return;
      }
      try {
        await manager.start(config, password);
        vscode.window.showInformationMessage('MCP server started.');
        showOutputChannel();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to start MCP server: ${message}`);
        updateStatusIndicator('Error', message);
      }
    }),
    vscode.commands.registerCommand('firebirdMcp.stopServer', () => {
      manager.stop();
      vscode.window.showInformationMessage('MCP server stopped.');
    }),
    vscode.commands.registerCommand('firebirdMcp.serverStatus', () => {
      const status = manager.status();
      vscode.window.showInformationMessage(`MCP server status: ${status} (${manager.getState()})`);
    }),
    vscode.commands.registerCommand('firebirdMcp.testConnection', async () => {
      await runConnectionProbe(false);
    }),
    vscode.commands.registerCommand('firebirdMcp.testConnectionExtended', async () => {
      await runConnectionProbe(true);
    }),
    vscode.commands.registerCommand('firebirdMcp.setPassword', async () => {
      const password = await vscode.window.showInputBox({
        prompt: 'Enter Firebird database password',
        password: true,
      });
      if (password && password.trim().length > 0) {
        await secretStore.setPassword(password.trim());
        vscode.window.showInformationMessage('Password set successfully.');
      } else if (password !== undefined) {
        vscode.window.showWarningMessage('Password cannot be empty.');
      }
    }),
  );

  // Auto-start if enabled
  const config = getExtensionConfig();
  if (config.autoStart) {
    updateStatusIndicator('Starting', 'Auto-start in progress');
    void tryAutoStart(config);
  }
}

async function runConnectionProbe(extended: boolean): Promise<void> {
  const config = getExtensionConfig();
  const password = await secretStore.getPassword();
  if (!password) {
    vscode.window.showErrorMessage('Password not set. Use "Set Firebird Password" command first.');
    updateStatusIndicator('Error', 'Connection test failed: password is not set');
    return;
  }

  updateStatusIndicator(
    'Starting',
    extended
      ? 'Running MCP handshake, tools/list, ping, list_tables and execute_query probe'
      : 'Running MCP handshake, tools/list, and ping probe',
  );

  try {
    const probe = await manager.testConnection(config, password, 5000, {
      checkExecuteQuery: extended,
    });
    const summary = formatProbeSummary(probe);
    const warningSuffix =
      probe.warnings.length > 0 ? ` Warnings: ${probe.warnings.join(' | ')}` : '';
    updateStatusIndicator('Ready', `Connection test passed. ${summary}${warningSuffix}`);
    vscode.window.showInformationMessage(`MCP connection test passed. ${summary}.${warningSuffix}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    updateStatusIndicator('Error', message);
    vscode.window.showErrorMessage(`MCP connection test failed: ${message}`);
  }
}

function formatProbeSummary(probe: ConnectionProbeResult): string {
  const checks = [
    `tools/list: ${probe.toolsCount} tools`,
    `ping: ${probe.pingOk ? 'ok' : 'failed'}`,
    probe.listTablesChecked
      ? `list_tables: ${probe.listTablesOk ? 'ok' : 'warning'}`
      : 'list_tables: skipped',
    probe.executeQueryChecked
      ? `execute_query: ${probe.executeQueryOk ? 'ok' : 'warning'}`
      : 'execute_query: skipped',
  ];

  return checks.join(', ');
}

export function deactivate() {
  if (manager) {
    manager.stop();
  }

  if (statusBarItem) {
    statusBarItem.dispose();
  }
}

function getExtensionConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('firebirdMcp');
  return {
    host: config.get('host', 'localhost'),
    database: config.get('database'),
    port: config.get('port', 3050),
    user: config.get('user', 'SYSDBA'),
    role: config.get('role'),
    readOnly: config.get('readOnly', false),
    insiders: config.get('insiders', false),
    executeQueryMode: config.get('executeQueryMode'),
    toolsets: config.get('toolsets'),
    tools: config.get('tools'),
    logLevel: config.get('logLevel', 'info'),
    autoStart: config.get('autoStart', false),
  } as ExtensionConfig;
}

async function tryAutoStart(config: ExtensionConfig): Promise<void> {
  try {
    const password = await secretStore.getPassword();
    if (!password) {
      vscode.window.showWarningMessage(
        'Firebird MCP auto-start skipped: password is not set. Run "Set Firebird Password" first.',
      );
      updateStatusIndicator('Stopped', 'Auto-start skipped: password is not set');
      return;
    }

    await manager.start(config, password);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Auto-start failed: ${message}`);
    updateStatusIndicator('Error', message);
  }
}

function updateStatusIndicator(state: McpProcessState, details?: string): void {
  if (!statusBarItem) {
    return;
  }

  switch (state) {
    case 'Starting':
      statusBarItem.text = '$(sync~spin) Firebird MCP: Starting';
      break;
    case 'Ready':
      statusBarItem.text = '$(check) Firebird MCP: Ready';
      break;
    case 'Error':
      statusBarItem.text = '$(error) Firebird MCP: Error';
      break;
    case 'Stopped':
    default:
      statusBarItem.text = '$(circle-slash) Firebird MCP: Stopped';
      break;
  }

  statusBarItem.tooltip = details ? `Firebird MCP\n${details}` : `Firebird MCP\nState: ${state}`;
}
