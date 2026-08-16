import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createInterface } from 'readline';
import type * as vscode from 'vscode';
import { ExtensionConfig } from './extension-types';
import { log } from './output-channel';

export interface McpProcessManagerOptions {
  serverScriptPath?: string;
  workingDirectory?: string;
  nodeCommand?: string;
}

export type McpProcessState = 'Starting' | 'Ready' | 'Error' | 'Stopped';

export interface ConnectionProbeResult {
  toolsCount: number;
  pingOk: boolean;
  listTablesChecked: boolean;
  listTablesOk: boolean;
  executeQueryChecked: boolean;
  executeQueryOk: boolean;
  warnings: string[];
}

export interface ConnectionProbeOptions {
  checkExecuteQuery?: boolean;
}

function toErrorMessage(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Error) {
    return value.message;
  }

  return 'Unknown error';
}

export class McpProcessManager {
  private process: child_process.ChildProcess | undefined;
  private outputChannel: vscode.OutputChannel;
  private readonly serverScriptPath: string;
  private readonly workingDirectory: string;
  private readonly nodeCommand: string;
  private state: McpProcessState = 'Stopped';
  private stopRequested = false;
  private readonly stateListeners = new Set<(state: McpProcessState) => void>();

  constructor(outputChannel: vscode.OutputChannel, options?: McpProcessManagerOptions) {
    this.outputChannel = outputChannel;
    this.serverScriptPath =
      options?.serverScriptPath ?? path.resolve(process.cwd(), 'dist/server.js');
    this.workingDirectory = options?.workingDirectory ?? process.cwd();
    this.nodeCommand = options?.nodeCommand ?? 'node';
  }

  onStateChanged(listener: (state: McpProcessState) => void): vscode.Disposable {
    this.stateListeners.add(listener);
    return {
      dispose: () => {
        this.stateListeners.delete(listener);
      },
    };
  }

  private setState(nextState: McpProcessState): void {
    if (this.state === nextState) {
      return;
    }

    this.state = nextState;
    for (const listener of this.stateListeners) {
      listener(nextState);
    }
  }

  private ensureEntrypointExists(): void {
    if (!fs.existsSync(this.serverScriptPath)) {
      throw new Error(
        `MCP server entrypoint not found at ${this.serverScriptPath}. Run "pnpm run build" and verify extension packaging.`,
      );
    }
  }

  private buildEnv(config: ExtensionConfig, password: string): Record<string, string | undefined> {
    return {
      ...process.env,
      FIREBIRD_HOST: config.host,
      FIREBIRD_DATABASE: config.database || '',
      FIREBIRD_PORT: config.port.toString(),
      FIREBIRD_USER: config.user,
      FIREBIRD_PASSWORD: password,
      ...(config.role ? { FIREBIRD_ROLE: config.role } : {}),
      LOG_LEVEL: config.logLevel,
      MCP_READ_ONLY: String(config.readOnly),
      MCP_INSIDERS: String(config.insiders),
      ...(config.executeQueryMode ? { MCP_EXECUTE_QUERY_MODE: config.executeQueryMode } : {}),
      MCP_TELEMETRY_CLIENT_PROFILE: 'vscode',
      ...(config.toolsets?.length ? { MCP_TOOLSETS: config.toolsets.join(',') } : {}),
      ...(config.tools?.length ? { MCP_TOOLS: config.tools.join(',') } : {}),
    };
  }

  start(config: ExtensionConfig, password: string): Promise<void> {
    if (this.process) {
      throw new Error('MCP server is already running');
    }

    this.ensureEntrypointExists();
    this.setState('Starting');
    this.stopRequested = false;

    const env = this.buildEnv(config, password);

    log(`Starting MCP server from ${this.serverScriptPath}...`);
    this.process = child_process.spawn(this.nodeCommand, [this.serverScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      cwd: this.workingDirectory,
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.outputChannel.append(data.toString());
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      this.outputChannel.append(data.toString());
    });

    this.process.on('exit', (code: number | null) => {
      log(`MCP process exited with code ${code ?? 'unknown'}`);
      this.process = undefined;
      if (this.stopRequested) {
        this.stopRequested = false;
        this.setState('Stopped');
        return;
      }

      this.setState(code === 0 ? 'Stopped' : 'Error');
    });

    this.process.on('error', (err: Error) => {
      log(`MCP process error: ${err.message}`);
      this.process = undefined;
      this.setState('Error');
    });

    return Promise.resolve();
  }

  stop(): void {
    if (this.process) {
      log('Stopping MCP server...');
      this.stopRequested = true;
      this.process.kill();
      this.process = undefined;
    }

    this.setState('Stopped');
  }

  status(): string {
    return this.process ? 'Running' : 'Stopped';
  }

  async restart(config: ExtensionConfig, password: string): Promise<void> {
    this.stop();
    await this.start(config, password);
  }

  getState(): McpProcessState {
    return this.state;
  }

  async testConnection(
    config: ExtensionConfig,
    password: string,
    timeoutMs = 5000,
    options?: ConnectionProbeOptions,
  ): Promise<ConnectionProbeResult> {
    this.ensureEntrypointExists();

    const env = this.buildEnv(config, password);

    return await new Promise<ConnectionProbeResult>((resolve, reject) => {
      const probe = child_process.spawn(this.nodeCommand, [this.serverScriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        cwd: this.workingDirectory,
      });

      let settled = false;
      const lineReader = createInterface({ input: probe.stdout });

      const settle = (fn: () => void): void => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutHandle);
        lineReader.close();
        probe.kill();
        fn();
      };

      const timeoutHandle = setTimeout(() => {
        settle(() => reject(new Error('MCP connection test timed out')));
      }, timeoutMs);

      let toolsCount = 0;
      let listTablesSupported = false;
      let listTablesOk = false;
      let executeQuerySupported = false;
      const warnings: string[] = [];

      lineReader.on('line', (line) => {
        let payload: unknown;
        try {
          payload = JSON.parse(line);
        } catch {
          return;
        }

        if (!payload || typeof payload !== 'object') {
          return;
        }

        const maybeResponse = payload as {
          id?: unknown;
          error?: { message?: unknown };
          result?: {
            tools?: unknown;
            content?: unknown;
            isError?: unknown;
          };
        };

        if (maybeResponse.id === 1) {
          const initializeErrorMessage = maybeResponse.error?.message;
          if (initializeErrorMessage) {
            settle(() =>
              reject(new Error(`Initialize failed: ${toErrorMessage(initializeErrorMessage)}`)),
            );
            return;
          }

          probe.stdin.write(
            `${JSON.stringify({
              jsonrpc: '2.0',
              method: 'notifications/initialized',
            })}\n`,
          );
          probe.stdin.write(
            `${JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              method: 'tools/list',
              params: {},
            })}\n`,
          );
          return;
        }

        if (maybeResponse.id === 2) {
          const toolsListErrorMessage = maybeResponse.error?.message;
          if (toolsListErrorMessage) {
            settle(() =>
              reject(new Error(`tools/list failed: ${toErrorMessage(toolsListErrorMessage)}`)),
            );
            return;
          }

          const tools = Array.isArray(maybeResponse.result?.tools)
            ? maybeResponse.result.tools
            : [];
          toolsCount = tools.length;
          listTablesSupported = tools.some((item) => {
            if (!item || typeof item !== 'object') {
              return false;
            }

            const tool = item as { name?: unknown };
            return tool.name === 'list_tables';
          });
          executeQuerySupported = tools.some((item) => {
            if (!item || typeof item !== 'object') {
              return false;
            }

            const tool = item as { name?: unknown };
            return tool.name === 'execute_query';
          });

          probe.stdin.write(
            `${JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              method: 'tools/call',
              params: {
                name: 'ping',
                arguments: {},
              },
            })}\n`,
          );
          return;
        }

        if (maybeResponse.id === 3) {
          if (maybeResponse.error?.message || maybeResponse.result?.isError === true) {
            settle(() => reject(new Error('tools/call ping failed')));
            return;
          }

          if (!listTablesSupported) {
            warnings.push('list_tables is not available in current tool selection');
            if (!options?.checkExecuteQuery) {
              settle(() =>
                resolve({
                  toolsCount,
                  pingOk: true,
                  listTablesChecked: false,
                  listTablesOk: false,
                  executeQueryChecked: false,
                  executeQueryOk: false,
                  warnings,
                }),
              );
              return;
            }

            if (!executeQuerySupported) {
              warnings.push('execute_query is not available in current tool selection');
              settle(() =>
                resolve({
                  toolsCount,
                  pingOk: true,
                  listTablesChecked: false,
                  listTablesOk: false,
                  executeQueryChecked: false,
                  executeQueryOk: false,
                  warnings,
                }),
              );
              return;
            }

            probe.stdin.write(
              `${JSON.stringify({
                jsonrpc: '2.0',
                id: 5,
                method: 'tools/call',
                params: {
                  name: 'execute_query',
                  arguments: {
                    sql: 'SELECT 1 AS HEALTH FROM RDB$DATABASE',
                    params: [],
                  },
                },
              })}\n`,
            );
            return;
          }

          probe.stdin.write(
            `${JSON.stringify({
              jsonrpc: '2.0',
              id: 4,
              method: 'tools/call',
              params: {
                name: 'list_tables',
                arguments: {
                  limit: 1,
                },
              },
            })}\n`,
          );
          return;
        }

        if (maybeResponse.id === 4) {
          listTablesOk = !maybeResponse.error?.message && maybeResponse.result?.isError !== true;
          if (!listTablesOk) {
            warnings.push('list_tables check did not complete successfully');
          }

          if (!options?.checkExecuteQuery) {
            settle(() =>
              resolve({
                toolsCount,
                pingOk: true,
                listTablesChecked: true,
                listTablesOk,
                executeQueryChecked: false,
                executeQueryOk: false,
                warnings,
              }),
            );
            return;
          }

          if (!executeQuerySupported) {
            warnings.push('execute_query is not available in current tool selection');
            settle(() =>
              resolve({
                toolsCount,
                pingOk: true,
                listTablesChecked: true,
                listTablesOk,
                executeQueryChecked: false,
                executeQueryOk: false,
                warnings,
              }),
            );
            return;
          }

          probe.stdin.write(
            `${JSON.stringify({
              jsonrpc: '2.0',
              id: 5,
              method: 'tools/call',
              params: {
                name: 'execute_query',
                arguments: {
                  sql: 'SELECT 1 AS HEALTH FROM RDB$DATABASE',
                  params: [],
                },
              },
            })}\n`,
          );
          return;
        }

        if (maybeResponse.id === 5) {
          const executeQueryOk =
            !maybeResponse.error?.message && maybeResponse.result?.isError !== true;
          if (!executeQueryOk) {
            warnings.push('execute_query check did not complete successfully');
          }

          settle(() =>
            resolve({
              toolsCount,
              pingOk: true,
              listTablesChecked: true,
              listTablesOk,
              executeQueryChecked: true,
              executeQueryOk,
              warnings,
            }),
          );
        }
      });

      probe.on('error', (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        settle(() => reject(new Error(`MCP probe process failed: ${message}`)));
      });

      probe.on('exit', (code) => {
        if (!settled && code !== 0) {
          settle(() =>
            reject(new Error(`MCP probe exited unexpectedly with code ${code ?? 'unknown'}`)),
          );
        }
      });

      probe.stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: {
              name: 'firebird-mcp-vscode-extension',
              version: '0.2.0',
            },
          },
        })}\n`,
      );
    });
  }
}
