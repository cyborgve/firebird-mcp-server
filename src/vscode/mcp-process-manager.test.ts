import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { McpProcessManager } from './mcp-process-manager';
import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import { ExtensionConfig } from './extension-types';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('./output-channel', () => ({
  log: vi.fn(),
}));

describe('McpProcessManager', () => {
  let mockOutputChannel: vscode.OutputChannel;
  const spawnMock = vi.mocked(childProcess.spawn);
  const existsSyncMock = vi.mocked(fs.existsSync);

  const baseConfig: ExtensionConfig = {
    host: '127.0.0.1',
    database: 'sample.fdb',
    port: 3050,
    user: 'SYSDBA',
    readOnly: true,
    insiders: true,
    toolsets: ['readonly', 'schema'],
    tools: ['ping', 'list_tables'],
    logLevel: 'debug',
    autoStart: false,
  };

  function createMockProcess(): childProcess.ChildProcess {
    const proc = new EventEmitter() as childProcess.ChildProcess;
    proc.stdin = new PassThrough();
    proc.stdout = new PassThrough();
    proc.stderr = new PassThrough();
    proc.kill = vi.fn(() => true);
    return proc;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockOutputChannel = {
      append: vi.fn(),
      appendLine: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
      hide: vi.fn(),
      name: 'Mock',
      show: vi.fn(),
    } as unknown as vscode.OutputChannel;
  });

  it('should report stopped status initially', () => {
    const manager = new McpProcessManager(mockOutputChannel);
    expect(manager.status()).toBe('Stopped');
    expect(manager.getState()).toBe('Stopped');
  });

  it('should fail start when server entrypoint does not exist', () => {
    existsSyncMock.mockReturnValue(false);
    const manager = new McpProcessManager(mockOutputChannel, {
      serverScriptPath: 'C:/repo/dist/server.js',
      workingDirectory: 'C:/repo',
    });

    expect(() => manager.start(baseConfig, 'secret')).toThrow(
      'MCP server entrypoint not found at C:/repo/dist/server.js',
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('should spawn MCP process with configured script path, cwd, and env', async () => {
    existsSyncMock.mockReturnValue(true);
    const mockProcess = createMockProcess();
    spawnMock.mockReturnValue(mockProcess);
    const manager = new McpProcessManager(mockOutputChannel, {
      serverScriptPath: 'C:/repo/dist/server.js',
      workingDirectory: 'C:/repo',
    });

    await manager.start(baseConfig, 'secret');

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      'node',
      ['C:/repo/dist/server.js'],
      expect.objectContaining({
        cwd: 'C:/repo',
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    );

    const options = spawnMock.mock.calls[0]?.[2];
    expect(options?.env).toMatchObject({
      FIREBIRD_HOST: '127.0.0.1',
      FIREBIRD_DATABASE: 'sample.fdb',
      FIREBIRD_PORT: '3050',
      FIREBIRD_USER: 'SYSDBA',
      FIREBIRD_PASSWORD: 'secret',
      LOG_LEVEL: 'debug',
      MCP_READ_ONLY: 'true',
      MCP_INSIDERS: 'true',
      MCP_TELEMETRY_CLIENT_PROFILE: 'vscode',
      MCP_TOOLSETS: 'readonly,schema',
      MCP_TOOLS: 'ping,list_tables',
    });
    expect(manager.status()).toBe('Running');
  });

  it('should prevent starting twice while process is running', async () => {
    existsSyncMock.mockReturnValue(true);
    spawnMock.mockReturnValue(createMockProcess());
    const manager = new McpProcessManager(mockOutputChannel, {
      serverScriptPath: 'C:/repo/dist/server.js',
      workingDirectory: 'C:/repo',
    });

    await manager.start(baseConfig, 'secret');
    expect(() => manager.start(baseConfig, 'secret')).toThrow('MCP server is already running');
  });

  it('should stop a running process and report stopped status', async () => {
    existsSyncMock.mockReturnValue(true);
    const mockProcess = createMockProcess();
    const killSpy = vi.fn(() => true);
    mockProcess.kill = killSpy;
    spawnMock.mockReturnValue(mockProcess);
    const manager = new McpProcessManager(mockOutputChannel, {
      serverScriptPath: 'C:/repo/dist/server.js',
      workingDirectory: 'C:/repo',
    });

    await manager.start(baseConfig, 'secret');
    manager.stop();

    expect(killSpy).toHaveBeenCalledTimes(1);
    expect(manager.status()).toBe('Stopped');
    expect(manager.getState()).toBe('Stopped');
  });

  it('should emit state transitions during start and stop', async () => {
    existsSyncMock.mockReturnValue(true);
    spawnMock.mockReturnValue(createMockProcess());
    const manager = new McpProcessManager(mockOutputChannel, {
      serverScriptPath: 'C:/repo/dist/server.js',
      workingDirectory: 'C:/repo',
    });

    const observedStates: string[] = [];
    manager.onStateChanged((state) => {
      observedStates.push(state);
    });

    await manager.start(baseConfig, 'secret');
    manager.stop();

    expect(observedStates).toEqual(['Starting', 'Stopped']);
  });

  it('should complete testConnection with tool count from tools/list', async () => {
    existsSyncMock.mockReturnValue(true);
    const probeProcess = createMockProcess();
    const probeKillSpy = vi.fn(() => true);
    probeProcess.kill = probeKillSpy;
    spawnMock.mockReturnValue(probeProcess);
    const manager = new McpProcessManager(mockOutputChannel, {
      serverScriptPath: 'C:/repo/dist/server.js',
      workingDirectory: 'C:/repo',
    });

    const probePromise = manager.testConnection(baseConfig, 'secret', 1000);
    await Promise.resolve();

    const probeStdout = probeProcess.stdout as PassThrough;

    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          serverInfo: { name: 'firebird-mcp', version: '0.2.0' },
        },
      })}\n`,
    );
    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        result: {
          tools: [{ name: 'ping' }, { name: 'list_tables' }],
        },
      })}\n`,
    );
    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        result: {
          content: [{ type: 'text', text: 'pong' }],
          isError: false,
        },
      })}\n`,
    );
    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        result: {
          content: [{ type: 'text', text: '{"tables":[]}' }],
          isError: false,
        },
      })}\n`,
    );

    await expect(probePromise).resolves.toEqual({
      toolsCount: 2,
      pingOk: true,
      listTablesChecked: true,
      listTablesOk: true,
      executeQueryChecked: false,
      executeQueryOk: false,
      warnings: [],
    });
    expect(probeKillSpy).toHaveBeenCalled();
  });

  it('should skip list_tables check when tool is not available', async () => {
    existsSyncMock.mockReturnValue(true);
    const probeProcess = createMockProcess();
    spawnMock.mockReturnValue(probeProcess);
    const manager = new McpProcessManager(mockOutputChannel, {
      serverScriptPath: 'C:/repo/dist/server.js',
      workingDirectory: 'C:/repo',
    });

    const probePromise = manager.testConnection(baseConfig, 'secret', 1000);
    await Promise.resolve();

    const probeStdout = probeProcess.stdout as PassThrough;

    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          serverInfo: { name: 'firebird-mcp', version: '0.2.0' },
        },
      })}\n`,
    );
    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        result: {
          tools: [{ name: 'ping' }],
        },
      })}\n`,
    );
    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        result: {
          content: [{ type: 'text', text: 'pong' }],
          isError: false,
        },
      })}\n`,
    );

    await expect(probePromise).resolves.toEqual({
      toolsCount: 1,
      pingOk: true,
      listTablesChecked: false,
      listTablesOk: false,
      executeQueryChecked: false,
      executeQueryOk: false,
      warnings: ['list_tables is not available in current tool selection'],
    });
  });

  it('should run execute_query check in extended mode when available', async () => {
    existsSyncMock.mockReturnValue(true);
    const probeProcess = createMockProcess();
    spawnMock.mockReturnValue(probeProcess);
    const manager = new McpProcessManager(mockOutputChannel, {
      serverScriptPath: 'C:/repo/dist/server.js',
      workingDirectory: 'C:/repo',
    });

    const probePromise = manager.testConnection(baseConfig, 'secret', 1000, {
      checkExecuteQuery: true,
    });
    await Promise.resolve();

    const probeStdout = probeProcess.stdout as PassThrough;

    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          serverInfo: { name: 'firebird-mcp', version: '0.2.0' },
        },
      })}\n`,
    );
    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        result: {
          tools: [{ name: 'ping' }, { name: 'list_tables' }, { name: 'execute_query' }],
        },
      })}\n`,
    );
    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        result: {
          content: [{ type: 'text', text: 'pong' }],
          isError: false,
        },
      })}\n`,
    );
    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        result: {
          content: [{ type: 'text', text: '{"tables":[]}' }],
          isError: false,
        },
      })}\n`,
    );
    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        result: {
          content: [{ type: 'text', text: '{"rows":[{"HEALTH":1}]}' }],
          isError: false,
        },
      })}\n`,
    );

    await expect(probePromise).resolves.toEqual({
      toolsCount: 3,
      pingOk: true,
      listTablesChecked: true,
      listTablesOk: true,
      executeQueryChecked: true,
      executeQueryOk: true,
      warnings: [],
    });
  });

  it('should fail testConnection when ping call returns error', async () => {
    existsSyncMock.mockReturnValue(true);
    const probeProcess = createMockProcess();
    spawnMock.mockReturnValue(probeProcess);
    const manager = new McpProcessManager(mockOutputChannel, {
      serverScriptPath: 'C:/repo/dist/server.js',
      workingDirectory: 'C:/repo',
    });

    const probePromise = manager.testConnection(baseConfig, 'secret', 1000);
    await Promise.resolve();

    const probeStdout = probeProcess.stdout as PassThrough;
    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          serverInfo: { name: 'firebird-mcp', version: '0.2.0' },
        },
      })}\n`,
    );
    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        result: {
          tools: [{ name: 'ping' }, { name: 'list_tables' }],
        },
      })}\n`,
    );
    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        error: {
          message: 'tool failure',
        },
      })}\n`,
    );

    await expect(probePromise).rejects.toThrow('tools/call ping failed');
  });

  it('should return warning when extended execute_query check fails', async () => {
    existsSyncMock.mockReturnValue(true);
    const probeProcess = createMockProcess();
    spawnMock.mockReturnValue(probeProcess);
    const manager = new McpProcessManager(mockOutputChannel, {
      serverScriptPath: 'C:/repo/dist/server.js',
      workingDirectory: 'C:/repo',
    });

    const probePromise = manager.testConnection(baseConfig, 'secret', 1000, {
      checkExecuteQuery: true,
    });
    await Promise.resolve();

    const probeStdout = probeProcess.stdout as PassThrough;
    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          serverInfo: { name: 'firebird-mcp', version: '0.2.0' },
        },
      })}\n`,
    );
    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        result: {
          tools: [{ name: 'ping' }, { name: 'list_tables' }, { name: 'execute_query' }],
        },
      })}\n`,
    );
    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        result: {
          content: [{ type: 'text', text: 'pong' }],
          isError: false,
        },
      })}\n`,
    );
    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        result: {
          content: [{ type: 'text', text: '{"tables":[]}' }],
          isError: false,
        },
      })}\n`,
    );
    probeStdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        result: {
          content: [{ type: 'text', text: 'query blocked' }],
          isError: true,
        },
      })}\n`,
    );

    await expect(probePromise).resolves.toEqual({
      toolsCount: 3,
      pingOk: true,
      listTablesChecked: true,
      listTablesOk: true,
      executeQueryChecked: true,
      executeQueryOk: false,
      warnings: ['execute_query check did not complete successfully'],
    });
  });

  it('should timeout testConnection when probe does not respond', async () => {
    vi.useFakeTimers();
    try {
      existsSyncMock.mockReturnValue(true);
      const probeProcess = createMockProcess();
      const probeKillSpy = vi.fn(() => true);
      probeProcess.kill = probeKillSpy;
      spawnMock.mockReturnValue(probeProcess);
      const manager = new McpProcessManager(mockOutputChannel, {
        serverScriptPath: 'C:/repo/dist/server.js',
        workingDirectory: 'C:/repo',
      });

      const probePromise = manager.testConnection(baseConfig, 'secret', 50);
      const timeoutAssertion = expect(probePromise).rejects.toThrow(
        'MCP connection test timed out',
      );
      await vi.advanceTimersByTimeAsync(60);

      await timeoutAssertion;
      expect(probeKillSpy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
