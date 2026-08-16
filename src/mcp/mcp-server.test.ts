import { describe, expect, test, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createMcpServer } from './mcp-server';
import type { RuntimeConfig } from '../config/env-config';

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
    timeoutMs: 2000,
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

async function initializeServer(
  server: ReturnType<typeof createMcpServer>,
  options?: {
    protocolVersion?: string;
    capabilities?: {
      tools?: {
        listChanged?: boolean;
      };
    };
  },
): Promise<void> {
  await server.handleRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: options?.protocolVersion ?? '2025-03-26',
      ...(options?.capabilities ? { capabilities: options.capabilities } : {}),
    },
  });

  await server.handleRequest({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  });
}

function parseJsonObject(text: string | undefined): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text ?? '{}');
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
}

function parseTelemetryEntries(captured: string): Array<Record<string, unknown>> {
  const entries: Array<Record<string, unknown>> = [];

  for (const line of captured.split('\n')) {
    if (!line.trim()) {
      continue;
    }

    const entry = parseJsonObject(line);
    if (entry['telemetryKind'] !== undefined) {
      entries.push(entry);
    }
  }

  return entries;
}

describe('mcp-server', () => {
  test('should reject tools/list before initialized', async () => {
    const server = createMcpServer(runtimeConfig);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });

    expect(response).toBeTruthy();
    expect(response?.error?.code).toBe(-32002);
    expect(response?.error?.message).toBe('Server not initialized');
  });

  test('should reject initialize with invalid params using consistent invalid params error', async () => {
    const server = createMcpServer(runtimeConfig);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 100,
      method: 'initialize',
      params: {},
    });

    expect(response).toBeTruthy();
    expect(response?.error?.code).toBe(-32602);
    expect(response?.error?.message).toBe('Invalid params');
  });

  test('should reject initialize for unsupported protocol version', async () => {
    const server = createMcpServer(runtimeConfig);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 104,
      method: 'initialize',
      params: {
        protocolVersion: '2099-01-01',
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error?.code).toBe(-32602);
    expect(response?.error?.message).toBe(
      "Invalid params: unsupported protocol version '2099-01-01', supported versions: 2025-03-26, 2024-11-05",
    );
  });

  test('should accept initialize for latest supported protocol version', async () => {
    const server = createMcpServer(runtimeConfig);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 107,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error).toBeUndefined();
    expect(response?.result).toMatchObject({
      protocolVersion: '2025-03-26',
    });
  });

  test('should reject unknown rpc method with method-specific message', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 101,
      method: 'unknown/method',
    });

    expect(response).toBeTruthy();
    expect(response?.error?.code).toBe(-32601);
    expect(response?.error?.message).toBe('Method not found: unknown/method');
  });

  test('should reject tools/call when tool is missing from registry with consistent message', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 102,
      method: 'tools/call',
      params: {
        name: 'non_existent_tool',
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error?.code).toBe(-32601);
    expect(response?.error?.message).toBe('Tool not found: non_existent_tool');
  });

  test('should reject tools/call with missing tool name using consistent invalid params message', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 103,
      method: 'tools/call',
      params: {
        arguments: {},
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error?.code).toBe(-32602);
    expect(response?.error?.message).toBe('Invalid params: tool name is required');
  });

  test('should return initialize result and allow tools/list after initialized notification', async () => {
    const server = createMcpServer(runtimeConfig);

    const initializeResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
      },
    });

    expect(initializeResponse).toBeTruthy();
    expect(initializeResponse?.error).toBeUndefined();

    const initializedNotificationResponse = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    expect(initializedNotificationResponse).toBeNull();

    const toolsListResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    expect(toolsListResponse).toBeTruthy();
    expect(toolsListResponse?.error).toBeUndefined();
    const tools = (toolsListResponse?.result as { tools: Array<{ name: string }> }).tools;
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.some((tool) => tool.name === 'get_database_schema')).toBe(true);
  });

  test('should keep server uninitialized after initialize until notifications/initialized arrives', async () => {
    const server = createMcpServer(runtimeConfig);

    const initializeResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 15,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
      },
    });

    expect(initializeResponse?.error).toBeUndefined();

    const toolsListBeforeInitialized = await server.handleRequest({
      jsonrpc: '2.0',
      id: 16,
      method: 'tools/list',
    });

    expect(toolsListBeforeInitialized?.error?.code).toBe(-32002);
    expect(toolsListBeforeInitialized?.error?.message).toBe('Server not initialized');
  });

  test('should reject a second initialize request after handshake', async () => {
    const server = createMcpServer(runtimeConfig);

    const firstInitialize = await server.handleRequest({
      jsonrpc: '2.0',
      id: 105,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
      },
    });
    expect(firstInitialize?.error).toBeUndefined();

    const secondInitialize = await server.handleRequest({
      jsonrpc: '2.0',
      id: 106,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
      },
    });

    expect(secondInitialize?.error?.code).toBe(-32602);
    expect(secondInitialize?.error?.message).toBe('Invalid params: initialize already completed');
  });

  test('should ignore notifications/initialized before initialize handshake', async () => {
    const server = createMcpServer(runtimeConfig);

    const notificationResponse = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    expect(notificationResponse).toBeNull();

    const toolsListResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 17,
      method: 'tools/list',
    });

    expect(toolsListResponse?.error?.code).toBe(-32002);
    expect(toolsListResponse?.error?.message).toBe('Server not initialized');
  });

  test('should allow ping tool call after initialization', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'ping',
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error).toBeUndefined();
  });

  test('should return text content in tools/call responses', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 203,
      method: 'tools/call',
      params: {
        name: 'ping',
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error).toBeUndefined();

    const result = response?.result as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]?.type).toBe('text');
    expect(typeof result.content[0]?.text).toBe('string');
  });

  test('should apply external tools config path in tools/list', async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'fb-mcp-server-tools-'));

    try {
      const toolsConfigPath = path.join(tmpDir, 'tools.json');
      writeFileSync(
        toolsConfigPath,
        JSON.stringify({ enabledTools: ['ping', 'list_tables'] }),
        'utf8',
      );

      const server = createMcpServer({
        ...runtimeConfig,
        toolsConfigPath,
      });
      await initializeServer(server);

      const toolsListResponse = await server.handleRequest({
        jsonrpc: '2.0',
        id: 300,
        method: 'tools/list',
      });

      expect(toolsListResponse).toBeTruthy();
      expect(toolsListResponse?.error).toBeUndefined();

      const tools = (toolsListResponse?.result as { tools: Array<{ name: string }> }).tools;
      expect(tools.map((tool) => tool.name)).toEqual(['ping', 'list_tables']);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('should restrict tools/list and tools/call when toolset is active', async () => {
    const server = createMcpServer({
      ...runtimeConfig,
      toolsets: ['ops'],
    });
    await initializeServer(server);

    const toolsListResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 301,
      method: 'tools/list',
    });

    expect(toolsListResponse).toBeTruthy();
    expect(toolsListResponse?.error).toBeUndefined();
    const tools = (toolsListResponse?.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.map((tool) => tool.name)).toEqual(['ping', 'server_status']);

    const blockedCallResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 302,
      method: 'tools/call',
      params: {
        name: 'list_tables',
        arguments: {},
      },
    });

    expect(blockedCallResponse?.error?.code).toBe(-32601);
    expect(blockedCallResponse?.error?.message).toBe('Tool not found: list_tables');
  });

  test('should reject tools/reload when reload is disabled', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const reloadResponse = await server.handleRequest({
      jsonrpc: '2.0',
      id: 303,
      method: 'tools/reload',
    });

    expect(reloadResponse?.error?.code).toBe(-32601);
    expect(reloadResponse?.error?.message).toBe('Method not found: tools/reload');
  });

  test('should reload tool registry when enabled and external config changes', async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'fb-mcp-server-reload-'));

    try {
      const toolsConfigPath = path.join(tmpDir, 'tools.json');
      writeFileSync(
        toolsConfigPath,
        JSON.stringify({ enabledTools: ['ping', 'list_tables'] }),
        'utf8',
      );

      const server = createMcpServer({
        ...runtimeConfig,
        toolsConfigPath,
        toolsReloadEnabled: true,
      });
      await initializeServer(server);

      let toolsListResponse = await server.handleRequest({
        jsonrpc: '2.0',
        id: 304,
        method: 'tools/list',
      });
      let tools = (toolsListResponse?.result as { tools: Array<{ name: string }> }).tools;
      expect(tools.map((tool) => tool.name)).toEqual(['ping', 'list_tables']);

      writeFileSync(toolsConfigPath, JSON.stringify({ enabledTools: ['ping'] }), 'utf8');

      const reloadResponse = await server.handleRequest({
        jsonrpc: '2.0',
        id: 305,
        method: 'tools/reload',
      });

      expect(reloadResponse?.error).toBeUndefined();
      expect((reloadResponse?.result as { reloaded: boolean }).reloaded).toBe(true);

      toolsListResponse = await server.handleRequest({
        jsonrpc: '2.0',
        id: 306,
        method: 'tools/list',
      });
      tools = (toolsListResponse?.result as { tools: Array<{ name: string }> }).tools;
      expect(tools.map((tool) => tool.name)).toEqual(['ping']);

      const blockedCallResponse = await server.handleRequest({
        jsonrpc: '2.0',
        id: 307,
        method: 'tools/call',
        params: {
          name: 'list_tables',
          arguments: {},
        },
      });

      expect(blockedCallResponse?.error?.code).toBe(-32601);
      expect(blockedCallResponse?.error?.message).toBe('Tool not found: list_tables');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('should allow tools/reload when enabled regardless of client listChanged capability', async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'fb-mcp-server-reload-cap-'));

    try {
      const toolsConfigPath = path.join(tmpDir, 'tools.json');
      writeFileSync(toolsConfigPath, JSON.stringify({ enabledTools: ['ping'] }), 'utf8');

      const server = createMcpServer({
        ...runtimeConfig,
        toolsConfigPath,
        toolsReloadEnabled: true,
      });
      await initializeServer(server, {
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
      });

      const reloadResponse = await server.handleRequest({
        jsonrpc: '2.0',
        id: 308,
        method: 'tools/reload',
      });

      expect(reloadResponse?.error).toBeUndefined();
      expect((reloadResponse?.result as { reloaded: boolean }).reloaded).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('should reject non-read-only execute_query', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'execute_query',
        arguments: {
          sql: "UPDATE USERS SET NAME = 'X'",
        },
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error?.code).toBe(-32003);
  });

  test('should return empty schema array for get_database_schema when no database is configured', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'get_database_schema',
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error).toBeUndefined();

    const result = response?.result as {
      content: Array<{ type: 'text'; text: string }>;
    };
    expect(result.content[0]?.type).toBe('text');

    const parsed = parseJsonObject(result.content[0]?.text);
    const schema = parsed['schema'];
    expect(Array.isArray(schema)).toBe(true);
    expect(schema).toHaveLength(0);
  });

  test('should return empty indexes for list_indexes when no database is configured', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 520,
      method: 'tools/call',
      params: {
        name: 'list_indexes',
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error).toBeUndefined();

    const result = response?.result as {
      content: Array<{ type: 'text'; text: string }>;
    };
    const parsed = parseJsonObject(result.content[0]?.text);

    expect(parsed['indexes']).toEqual([]);
  });

  test('should return empty constraints for list_constraints when no database is configured', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 521,
      method: 'tools/call',
      params: {
        name: 'list_constraints',
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error).toBeUndefined();

    const result = response?.result as {
      content: Array<{ type: 'text'; text: string }>;
    };
    const parsed = parseJsonObject(result.content[0]?.text);

    expect(parsed['constraints']).toEqual([]);
  });

  test('should return database overview counters for database_overview when no database is configured', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 522,
      method: 'tools/call',
      params: {
        name: 'database_overview',
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error).toBeUndefined();

    const result = response?.result as {
      content: Array<{ type: 'text'; text: string }>;
    };
    const parsed = parseJsonObject(result.content[0]?.text);
    const overview = parsed['overview'] as Record<string, unknown>;

    expect(overview['configured']).toBe(false);
    expect(overview['connected']).toBe(false);
    expect(overview['tableCount']).toBe(0);
    expect(overview['indexCount']).toBe(0);
    expect(overview['constraintCount']).toBe(0);
  });

  test('should reject non-read-only explain_query_plan requests', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 523,
      method: 'tools/call',
      params: {
        name: 'explain_query_plan',
        arguments: {
          sql: 'DELETE FROM USERS',
        },
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error?.code).toBe(-32003);
  });

  test('should return heuristic plan metadata for explain_query_plan read-only SQL', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 524,
      method: 'tools/call',
      params: {
        name: 'explain_query_plan',
        arguments: {
          sql: 'SELECT 1 FROM RDB$DATABASE',
        },
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error).toBeUndefined();

    const result = response?.result as {
      content: Array<{ type: 'text'; text: string }>;
    };
    const parsed = parseJsonObject(result.content[0]?.text);
    const plan = parsed['plan'] as Record<string, unknown>;

    expect(plan['planner']).toBe('heuristic');
    expect(plan['readOnly']).toBe(true);
    expect(plan['explainable']).toBe(true);
    expect(Array.isArray(plan['referencedTables'])).toBe(true);
    expect(plan['hasJoins']).toBe(false);
    expect(plan['hasSubqueries']).toBe(false);
    expect(plan['estimatedComplexity']).toBe('low');
  });

  test('should reject get_table_schema call without table_name', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'get_table_schema',
        arguments: {},
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error?.code).toBe(-32602);
  });

  test('should reject execute_query call without sql argument', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'execute_query',
        arguments: {},
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error?.code).toBe(-32602);
  });

  test('should allow read-only execute_query with SELECT statement', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'execute_query',
        arguments: {
          sql: 'SELECT * FROM USERS',
        },
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error).toBeUndefined();

    const result = response?.result as {
      content: Array<{ type: 'text'; text: string }>;
    };
    const parsed = parseJsonObject(result.content[0]?.text);

    expect(parsed['mode']).toBe('read-only');
    expect(Array.isArray(parsed['rows'])).toBe(true);
    expect(parsed['rowCount']).toBe(0);
    expect(parsed['maxRows']).toBe(200);
    expect(parsed['totalRowsBeforeLimit']).toBe(0);
    expect(parsed['truncated']).toBe(false);
  });

  test('should allow read-only execute_query with a single trailing semicolon', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'execute_query',
        arguments: {
          sql: 'SELECT 1;',
        },
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error).toBeUndefined();
  });

  test('should reject execute_query with multiple statements', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'execute_query',
        arguments: {
          sql: 'SELECT 1; SELECT 2',
        },
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error?.code).toBe(-32003);
  });

  test('should allow execute_query with SQL comments as they are ignored', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: {
        name: 'execute_query',
        arguments: {
          sql: 'SELECT 1 -- hidden',
        },
      },
    });

    expect(response).toBeTruthy();
    expect(response?.result).toBeTruthy();
  });

  test('should reject execute_query when params length exceeds configured maximum', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: {
        name: 'execute_query',
        arguments: {
          sql: 'SELECT * FROM USERS WHERE A = ? AND B = ? AND C = ? AND D = ?',
          params: [1, 2, 3, 4],
        },
      },
    });

    expect(response).toBeTruthy();
    expect(response?.error?.code).toBe(-32602);
  });

  test('should advertise listChanged capability in initialize response', async () => {
    const server = createMcpServer(runtimeConfig);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
      },
    });

    expect(response).toBeTruthy();
    const result = response?.result as {
      capabilities: { tools: { listChanged: boolean } };
    };
    expect(result.capabilities.tools.listChanged).toBe(true);
  });

  test('should return all tools without nextCursor when tools fit in one page', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/list',
    });

    expect(response).toBeTruthy();
    expect(response?.error).toBeUndefined();

    const result = response?.result as {
      tools: Array<{ name: string }>;
      nextCursor?: string;
    };
    expect(result.tools.length).toBeGreaterThanOrEqual(6);
    expect(result.nextCursor).toBeUndefined();
  });

  test('should include read-only annotations in tools/list response', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 14,
      method: 'tools/list',
    });

    expect(response).toBeTruthy();
    expect(response?.error).toBeUndefined();

    const result = response?.result as {
      tools: Array<{ name: string; annotations?: { readOnlyHint?: boolean } }>;
    };
    const pingTool = result.tools.find((tool) => tool.name === 'ping');
    expect(pingTool?.annotations?.readOnlyHint).toBe(true);
  });

  test('should handle notifications/cancelled gracefully for unknown request IDs', async () => {
    const server = createMcpServer(runtimeConfig);
    await initializeServer(server);

    // Cancelling a non-existent request should not throw
    const response = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: {
        requestId: 999,
      },
    });

    // Notifications always return null
    expect(response).toBeNull();
  });

  test('should attach client telemetry dimensions from profile and initialize client info', async () => {
    let captured = '';
    const writeSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        captured += String(chunk);
        return true;
      });

    try {
      const server = createMcpServer({
        ...runtimeConfig,
        telemetry: {
          enabled: true,
          exporter: 'logs',
          maxStoredSpans: 50,
          clientProfile: 'vscode',
        },
      });

      await server.handleRequest({
        jsonrpc: '2.0',
        id: 410,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          clientInfo: {
            name: 'copilot-chat',
            version: '1.0.0',
          },
        },
      });

      await server.handleRequest({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      await server.handleRequest({
        jsonrpc: '2.0',
        id: 411,
        method: 'tools/list',
      });

      const telemetryEntries = parseTelemetryEntries(captured);
      expect(telemetryEntries.length).toBeGreaterThan(0);

      const matchingEntry = telemetryEntries.find((entry) => {
        const attributes = entry['attributes'];
        if (!attributes || typeof attributes !== 'object') {
          return false;
        }

        const typed = attributes as Record<string, unknown>;
        return (
          typed['clientProfile'] === 'vscode' &&
          typed['clientName'] === 'copilot-chat' &&
          typed['clientVersion'] === '1.0.0'
        );
      });

      expect(matchingEntry).toBeTruthy();
    } finally {
      writeSpy.mockRestore();
    }
  });
});
