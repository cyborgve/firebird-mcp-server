import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import type { Server as HttpServer } from 'node:http';
import { getRuntimeConfig } from './config/env-config';
import { createMcpServer } from './mcp/mcp-server';
import type { JsonRpcRequest } from './mcp/json-rpc-types';
import { drainPool } from './db/firebird/firebird-adapter';
import { setMinLogLevel } from './logging/logger';
import { logger } from './logging/logger';
import { createHttpTransportServer } from './transports/http-transport';

/**
 * Type guard verifying that an arbitrary payload strictly adheres to the JSON-RPC 2.0 request envelope.
 */
function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const maybeRequest = value as JsonRpcRequest;
  return maybeRequest.jsonrpc === '2.0' && typeof maybeRequest.method === 'string';
}

/**
 * Marshals a finalized JSON-RPC response object to the standard output stream for client consumption.
 * Ensures strict newline delimitation per MCP `stdio` transport requirements.
 */
function writeResponse(payload: unknown): void {
  stdout.write(`${JSON.stringify(payload)}\n`);
}

/**
 * The strict maximum duration permitted for in-flight requests to complete during a graceful shutdown sequence.
 */
const SHUTDOWN_TIMEOUT_MS = 5000;

function normalizeLogLevel(value: string | undefined): 'debug' | 'info' | 'warning' | 'error' {
  switch (value) {
    case 'debug':
      return 'debug';
    case 'info':
      return 'info';
    case 'warn':
    case 'warning':
      return 'warning';
    case 'error':
      return 'error';
    default:
      return 'info';
  }
}

/**
 * The initial asynchronous bootstrap entry point for the MCP application.
 * Manages configuration resolution, server instantiation, standard input stream parsing, and robust error boundaries.
 */
function main(): void {
  setMinLogLevel(normalizeLogLevel(process.env.LOG_LEVEL));
  const config = getRuntimeConfig();
  const server = createMcpServer(config);

  let shuttingDown = false;
  let inFlightCount = 0;
  let shutdownResolve: (() => void) | null = null;
  let httpServer: HttpServer | undefined;

  const lineReader =
    config.mcpTransport === 'stdio'
      ? createInterface({
          input: stdin,
          crlfDelay: Infinity,
        })
      : undefined;

  if (lineReader) {
    lineReader.on('line', (line) => {
      if (shuttingDown) {
        return;
      }

      if (!line.trim()) {
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        logger.warning('JSON parse error on stdin');
        writeResponse({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
          },
        });
        return;
      }

      if (!isJsonRpcRequest(parsed)) {
        logger.warning('Invalid JSON-RPC request envelope');
        writeResponse({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: 'Invalid Request',
          },
        });
        return;
      }

      inFlightCount += 1;

      void (async () => {
        try {
          const response = await server.handleRequest(parsed);
          if (response) {
            writeResponse(response);
          }
        } catch (error) {
          logger.error('Unhandled error in request processing', {
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          });
          writeResponse({
            jsonrpc: '2.0',
            id: parsed.id ?? null,
            error: {
              code: -32603,
              message: 'Internal error',
            },
          });
        } finally {
          inFlightCount -= 1;
          if (shuttingDown && inFlightCount === 0 && shutdownResolve) {
            shutdownResolve();
          }
        }
      })();
    });
  }

  if (config.mcpTransport === 'http') {
    httpServer = createHttpTransportServer(config, server);
    httpServer.on('close', () => {
      void gracefulShutdown('http server closed');
    });
    httpServer.listen(config.http.port, config.http.host, () => {
      logger.info('HTTP MCP transport listening', {
        host: config.http.host,
        port: config.http.port,
        path: config.http.path,
        requireAuthentication: config.http.requireAuthentication,
      });
    });
  }

  /**
   * Orchestrates a safe, orderly application termination.
   * Rejects new connections, awaits pending in-flight queries (up to a time limit), and cleanly drains the database connection pool.
   *
   * @param reason - The operational reason or subsystem signal triggering the shutdown cascade.
   */
  async function gracefulShutdown(reason: string): Promise<void> {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info(`Shutting down: ${reason}`, { inFlightCount });

    if (inFlightCount > 0) {
      await Promise.race([
        new Promise<void>((resolve) => {
          shutdownResolve = resolve;
        }),
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, SHUTDOWN_TIMEOUT_MS);
          const timerRef = timer as unknown as { unref?: () => void };
          timerRef.unref?.();
        }),
      ]);
    }

    if (inFlightCount > 0) {
      logger.warning('Shutdown timeout — abandoning in-flight requests', { inFlightCount });
    }

    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer?.close(() => resolve());
      });
    }

    await drainPool();
    logger.info('Shutdown complete');
    process.exitCode = 0;
  }

  lineReader?.on('close', () => {
    void gracefulShutdown('stdin closed');
  });

  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });
}

main();
