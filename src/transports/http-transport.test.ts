import { afterEach, describe, expect, test } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { RuntimeConfig } from '../config/env-config';
import { createHttpTransportServer } from './http-transport';
import type { JsonRpcRequest, JsonRpcResponse } from '../mcp/json-rpc-types';

interface HandlerLike {
  handleRequest: (request: JsonRpcRequest) => Promise<JsonRpcResponse | null>;
}

function createRuntimeConfig(overrides?: Partial<RuntimeConfig['http']>): RuntimeConfig {
  const http = {
    host: '127.0.0.1',
    port: 0,
    path: '/mcp',
    maxRequestBodyBytes: 1024 * 1024,
    allowedOrigins: [] as string[],
    requireAuthentication: false,
    enforceProtocolVersionHeader: true,
    ...(overrides ?? {}),
  };

  return {
    mcpTransport: 'http',
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
    http,
  };
}

async function startServer(
  config: RuntimeConfig,
  handler?: HandlerLike,
): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const mcpHandler: HandlerLike = handler ?? {
    handleRequest: (request) => {
      if (request.method === 'initialize') {
        return Promise.resolve({
          jsonrpc: '2.0',
          id: request.id ?? null,
          result: {
            protocolVersion: '2025-03-26',
            capabilities: { tools: { listChanged: true } },
          },
        });
      }

      return Promise.resolve({
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: {},
      });
    },
  };

  const server = createHttpTransportServer(config, mcpHandler);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}${config.http.path}`,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

const toClose: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (toClose.length > 0) {
    const closer = toClose.pop();
    if (closer) {
      await closer();
    }
  }
});

describe('http-transport', () => {
  test('should reject invalid origin', async () => {
    const instance = await startServer(
      createRuntimeConfig({
        allowedOrigins: ['https://trusted.example'],
      }),
    );
    toClose.push(instance.close);

    const response = await fetch(instance.url, {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });

    expect(response.status).toBe(403);
  });

  test('should reject unauthenticated request when auth is required', async () => {
    const instance = await startServer(
      createRuntimeConfig({
        requireAuthentication: true,
        authToken: 'token-123',
      }),
    );
    toClose.push(instance.close);

    const response = await fetch(instance.url, {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26' },
      }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
  });

  test('should reject invalid bearer token without leaking details', async () => {
    const instance = await startServer(
      createRuntimeConfig({
        requireAuthentication: true,
        authToken: 'expected-token',
      }),
    );
    toClose.push(instance.close);

    const response = await fetch(instance.url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer wrong-token',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 7,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26' },
      }),
    });

    expect(response.status).toBe(401);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload.error).toEqual({ code: -32001, message: 'Unauthorized' });
    expect(JSON.stringify(payload)).not.toContain('wrong-token');
    expect(JSON.stringify(payload)).not.toContain('expected-token');
  });

  test('should reject non-initialize request without protocol header', async () => {
    const instance = await startServer(createRuntimeConfig());
    toClose.push(instance.close);

    const response = await fetch(instance.url, {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
      }),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as JsonRpcResponse;
    expect(payload.error?.code).toBe(-32600);
    expect(payload.error?.message).toBe('Missing MCP-Protocol-Version header');
  });

  test('should reject unsupported protocol header version', async () => {
    const instance = await startServer(createRuntimeConfig());
    toClose.push(instance.close);

    const response = await fetch(instance.url, {
      method: 'POST',
      headers: {
        'MCP-Protocol-Version': '2024-01-01',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/list',
      }),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as JsonRpcResponse;
    expect(payload.error?.code).toBe(-32602);
    expect(payload.error?.message).toBe(
      'Unsupported MCP-Protocol-Version: 2024-01-01, supported versions: 2025-03-26, 2024-11-05',
    );
  });

  test('should allow request with latest supported protocol header version', async () => {
    const instance = await startServer(createRuntimeConfig());
    toClose.push(instance.close);

    const response = await fetch(instance.url, {
      method: 'POST',
      headers: {
        'MCP-Protocol-Version': '2025-03-26',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/list',
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('mcp-protocol-version')).toBe('2025-03-26');
  });

  test('should reject payloads larger than configured max body bytes', async () => {
    const instance = await startServer(
      createRuntimeConfig({
        maxRequestBodyBytes: 32,
      }),
    );
    toClose.push(instance.close);

    const response = await fetch(instance.url, {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 9,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
        },
      }),
    });

    expect(response.status).toBe(413);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload.error).toEqual({ code: -32700, message: 'Payload Too Large' });
  });

  test('should allow initialize without protocol header and return negotiated header', async () => {
    const instance = await startServer(createRuntimeConfig());
    toClose.push(instance.close);

    const response = await fetch(instance.url, {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('mcp-protocol-version')).toBe('2025-03-26');
  });

  test('should not echo unsupported initialize protocol version in response headers', async () => {
    const instance = await startServer(createRuntimeConfig(), {
      handleRequest: (request) => {
        if (request.method === 'initialize') {
          return Promise.resolve({
            jsonrpc: '2.0',
            id: request.id ?? null,
            error: {
              code: -32602,
              message: 'Unsupported initialize request',
            },
          });
        }

        return Promise.resolve({
          jsonrpc: '2.0',
          id: request.id ?? null,
          result: {},
        });
      },
    });
    toClose.push(instance.close);

    const response = await fetch(instance.url, {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method: 'initialize',
        params: {
          protocolVersion: '2024-01-01',
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('mcp-protocol-version')).toBeNull();
  });

  test('should allow valid authenticated request with protocol header', async () => {
    const instance = await startServer(
      createRuntimeConfig({
        requireAuthentication: true,
        authToken: 'token-xyz',
      }),
    );
    toClose.push(instance.close);

    const response = await fetch(instance.url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token-xyz',
        'MCP-Protocol-Version': '2025-03-26',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/list',
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as JsonRpcResponse;
    expect(payload.error).toBeUndefined();
  });
});
