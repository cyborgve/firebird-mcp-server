import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { RuntimeConfig } from '../config/env-config';
import type { JsonRpcRequest, JsonRpcResponse } from '../mcp/json-rpc-types';
import { logger } from '../logging/logger';
import { isSupportedProtocolVersion, SUPPORTED_PROTOCOL_VERSIONS } from '../mcp/protocol-version';

class PayloadTooLargeError extends Error {
  constructor() {
    super('Payload Too Large');
  }
}

interface McpRequestHandler {
  handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null>;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function writeJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  protocolVersion?: string,
): void {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
  };

  if (protocolVersion) {
    headers['MCP-Protocol-Version'] = protocolVersion;
  }

  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(payload));
}

function jsonRpcError(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  };
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const maybeRequest = value as JsonRpcRequest;
  return maybeRequest.jsonrpc === '2.0' && typeof maybeRequest.method === 'string';
}

function isLoopbackOrigin(origin: string): boolean {
  const normalized = origin.toLowerCase();
  return (
    normalized.startsWith('http://localhost') ||
    normalized.startsWith('https://localhost') ||
    normalized.startsWith('http://127.0.0.1') ||
    normalized.startsWith('https://127.0.0.1') ||
    normalized.startsWith('http://[::1]') ||
    normalized.startsWith('https://[::1]')
  );
}

function isOriginAllowed(origin: string | undefined, config: RuntimeConfig['http']): boolean {
  if (!origin) {
    return true;
  }

  if (config.allowedOrigins.length > 0) {
    return config.allowedOrigins.includes(origin);
  }

  return isLoopbackOrigin(origin);
}

function hasValidBearerToken(authHeader: string | undefined, expectedToken: string): boolean {
  if (!authHeader) {
    return false;
  }

  const [scheme, ...tokenParts] = authHeader.split(' ');
  if (scheme !== 'Bearer') {
    return false;
  }

  const actualToken = tokenParts.join(' ').trim();
  const expected = Buffer.from(expectedToken, 'utf8');
  const received = Buffer.from(actualToken, 'utf8');

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(received, expected);
}

async function readBody(req: IncomingMessage, maxRequestBodyBytes: number): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let rejected = false;

    req.on('data', (chunk: Buffer | string) => {
      if (rejected) {
        return;
      }

      const bufferChunk = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      totalBytes += bufferChunk.length;

      if (totalBytes > maxRequestBodyBytes) {
        rejected = true;
        reject(new PayloadTooLargeError());
        req.resume();
        return;
      }

      chunks.push(bufferChunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    req.on('error', reject);
  });
}

export function createHttpTransportServer(config: RuntimeConfig, mcpServer: McpRequestHandler) {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      if (req.method !== 'POST') {
        writeJson(res, 405, jsonRpcError(null, -32600, 'Method Not Allowed'));
        return;
      }

      if (req.url !== config.http.path) {
        writeJson(res, 404, jsonRpcError(null, -32600, 'Not Found'));
        return;
      }

      const origin = firstHeaderValue(req.headers.origin);
      if (!isOriginAllowed(origin, config.http)) {
        writeJson(res, 403, jsonRpcError(null, -32001, 'Forbidden origin'));
        return;
      }

      if (config.http.requireAuthentication) {
        const auth = firstHeaderValue(req.headers.authorization);
        if (!config.http.authToken || !hasValidBearerToken(auth, config.http.authToken)) {
          res.setHeader('WWW-Authenticate', 'Bearer');
          writeJson(res, 401, jsonRpcError(null, -32001, 'Unauthorized'));
          return;
        }
      }

      const protocolVersionHeader = firstHeaderValue(req.headers['mcp-protocol-version']);
      let parsed: unknown;
      let negotiatedProtocolVersion = protocolVersionHeader;

      try {
        const body = await readBody(req, config.http.maxRequestBodyBytes);
        parsed = JSON.parse(body);
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          writeJson(res, 413, jsonRpcError(null, -32700, 'Payload Too Large'));
          return;
        }

        writeJson(res, 400, jsonRpcError(null, -32700, 'Parse error'));
        return;
      }

      if (!isJsonRpcRequest(parsed)) {
        writeJson(res, 400, jsonRpcError(null, -32600, 'Invalid Request'));
        return;
      }

      if (parsed.method === 'initialize') {
        if (
          typeof parsed.params === 'object' &&
          parsed.params !== null &&
          'protocolVersion' in parsed.params &&
          typeof (parsed.params as Record<string, unknown>).protocolVersion === 'string'
        ) {
          const requestedProtocolVersion = (parsed.params as Record<string, unknown>)
            .protocolVersion as string;

          if (isSupportedProtocolVersion(requestedProtocolVersion)) {
            negotiatedProtocolVersion = requestedProtocolVersion;
          }
        }
      }

      if (config.http.enforceProtocolVersionHeader && parsed.method !== 'initialize') {
        if (!protocolVersionHeader) {
          writeJson(
            res,
            400,
            jsonRpcError(parsed.id ?? null, -32600, 'Missing MCP-Protocol-Version header'),
            negotiatedProtocolVersion,
          );
          return;
        }

        if (!isSupportedProtocolVersion(protocolVersionHeader)) {
          writeJson(
            res,
            400,
            jsonRpcError(
              parsed.id ?? null,
              -32602,
              `Unsupported MCP-Protocol-Version: ${protocolVersionHeader}, supported versions: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}`,
            ),
            negotiatedProtocolVersion,
          );
          return;
        }

        negotiatedProtocolVersion = protocolVersionHeader;
      }

      try {
        const response = await mcpServer.handleRequest(parsed);
        if (response === null) {
          res.writeHead(204, {
            ...(negotiatedProtocolVersion
              ? { 'MCP-Protocol-Version': negotiatedProtocolVersion }
              : {}),
          });
          res.end();
          return;
        }

        const responseProtocolVersion =
          parsed.method === 'initialize' &&
          typeof response.result === 'object' &&
          response.result !== null &&
          'protocolVersion' in response.result &&
          typeof (response.result as Record<string, unknown>).protocolVersion === 'string'
            ? ((response.result as Record<string, unknown>).protocolVersion as string)
            : negotiatedProtocolVersion;

        writeJson(res, 200, response, responseProtocolVersion);
      } catch (error) {
        logger.error('Unhandled error in HTTP transport request processing', {
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        writeJson(
          res,
          500,
          jsonRpcError(parsed.id ?? null, -32603, 'Internal error'),
          negotiatedProtocolVersion,
        );
      }
    })();
  });
}
