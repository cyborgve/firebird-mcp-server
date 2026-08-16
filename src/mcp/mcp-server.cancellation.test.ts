import { describe, expect, test, vi } from 'vitest';
import type { RuntimeConfig } from '../config/env-config';

vi.mock('./tools/tool-registry', () => ({
  createToolRegistry: () => ({
    getToolDefinitions: () => ({
      tools: [
        {
          name: 'slow_tool',
          description: 'Slow test tool',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }),
    getToolHandler: (name: string) => {
      if (name !== 'slow_tool') {
        return undefined;
      }

      return {
        definition: {
          name: 'slow_tool',
          description: 'Slow test tool',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        execute: async () => {
          return await new Promise(() => {
            // Intentional never-resolving promise to simulate long-running work.
          });
        },
      };
    },
    getToolCount: () => 1,
  }),
  getToolDefinitions: () => ({
    tools: [],
  }),
  getToolHandler: (name: string) => {
    if (name !== 'slow_tool') {
      return undefined;
    }

    return {
      definition: {
        name: 'slow_tool',
        description: 'Slow test tool',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      execute: async () => {
        return await new Promise(() => {
          // Intentional never-resolving promise to simulate long-running work.
        });
      },
    };
  },
}));

import { createMcpServer } from './mcp-server';

const runtimeConfig: RuntimeConfig = {
  mcpTransport: 'stdio',
  firebird: {
    host: '127.0.0.1',
    port: 3050,
    database: '',
    user: 'SYSDBA',
    password: 'masterkey',
    charset: 'UTF8',
  },
  executeQueryMode: 'safe',
  executeQueryAllowedIdentifiers: [],
  readOnly: false,
  toolsets: [],
  toolsReloadEnabled: false,
  toolTimeoutOverrides: {},
  firebirdVersionFamilyOverride: undefined,
  telemetry: {
    enabled: false,
    exporter: 'logs',
    maxStoredSpans: 200,
  },
  limits: {
    timeoutMs: 60000,
    listTablesMaxItems: 500,
    schemaMaxTables: 200,
    schemaMaxColumnsPerTable: 300,
    executeQueryMaxRows: 200,
    executeQueryMaxParams: 3,
    toolsPageSize: 50,
  },
  http: {
    host: '127.0.0.1',
    port: 3000,
    path: '/mcp',
    maxRequestBodyBytes: 1024 * 1024,
    allowedOrigins: [],
    requireAuthentication: false,
    enforceProtocolVersionHeader: true,
  },
};

async function initializeServer(server: ReturnType<typeof createMcpServer>): Promise<void> {
  await server.handleRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
    },
  });

  await server.handleRequest({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  });
}

describe('mcp-server cancellation', () => {
  test('should cancel in-flight request and return timeout-style cancellation error', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const callPromise = server.handleRequest({
      jsonrpc: '2.0',
      id: 200,
      method: 'tools/call',
      params: {
        name: 'slow_tool',
        arguments: {},
      },
    });

    const cancellationResponse = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: {
        requestId: 200,
      },
    });

    expect(cancellationResponse).toBeNull();

    const callResponse = await callPromise;
    expect(callResponse).toBeTruthy();
    expect(callResponse?.error?.code).toBe(-32800);
    expect(callResponse?.error?.message).toContain("Tool 'slow_tool' was cancelled");
  });
});
