import type {
  InitializeParams,
  JsonRpcErrorObject,
  JsonRpcRequest,
  JsonRpcResponse,
} from './json-rpc-types';
import type { RuntimeConfig } from '../config/env-config';
import { getPackageInfo } from '../config/package-info';
import { createToolRegistry } from './tools/tool-registry';
import {
  InvalidParamsError,
  McpError,
  MethodNotFoundError,
  ServerNotInitializedError,
  ToolCancelledError,
  ToolNotFoundError,
  ToolTimeoutError,
} from '../errors/index';
import { logger } from '../logging/logger';
import { createTelemetryRecorder } from '../observability/telemetry';
import { isSupportedProtocolVersion, SUPPORTED_PROTOCOL_VERSIONS } from './protocol-version';
import { stdout } from 'node:process';

/**
 * Encapsulates the runtime lifecycle state of the entire MCP server instance.
 */
interface McpServerState {
  hasInitializedHandshake: boolean;
  isInitialized: boolean;
  requestCounter: number;
  telemetryContext: {
    clientProfile: string | undefined;
    clientName: string | undefined;
    clientVersion: string | undefined;
  };
  /** Tracks natively abortable in-flight tool call requests for seamless `notifications/cancelled` support. */
  inFlightRequests: Map<string | number, AbortController>;
}

interface ToolCallParams {
  name: string | undefined;
  arguments: Record<string, unknown> | undefined;
}

function errorResponse(id: string | number | null, error: JsonRpcErrorObject): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error,
  };
}

function resultResponse(id: string | number | null, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

function toJsonRpcErrorObject(error: unknown): JsonRpcErrorObject {
  if (error instanceof McpError) {
    return {
      code: error.jsonRpcCode,
      message: error.message,
    };
  }

  return {
    code: -32603,
    message: 'Internal error',
  };
}

function getRequestId(request: JsonRpcRequest): string | number | null {
  return request.id ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getToolCallParams(value: unknown): ToolCallParams | null {
  if (!isRecord(value)) {
    return null;
  }

  const maybeName = value.name;
  const maybeArguments = value.arguments;

  if (maybeName !== undefined && typeof maybeName !== 'string') {
    return null;
  }

  if (maybeArguments !== undefined && !isRecord(maybeArguments)) {
    return null;
  }

  return {
    name: maybeName,
    arguments: maybeArguments,
  };
}

async function withToolTimeout<T>(
  toolName: string,
  timeoutMs: number,
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ToolCancelledError(toolName));
      return;
    }

    const timeoutHandle = setTimeout(() => {
      reject(new ToolTimeoutError(toolName, timeoutMs));
    }, timeoutMs);

    const onAbort = (): void => {
      clearTimeout(timeoutHandle);
      reject(new ToolCancelledError(toolName));
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    operation()
      .then((result) => {
        clearTimeout(timeoutHandle);
        signal?.removeEventListener('abort', onAbort);
        resolve(result);
      })
      .catch((error: unknown) => {
        clearTimeout(timeoutHandle);
        signal?.removeEventListener('abort', onAbort);
        if (error instanceof Error) {
          reject(error);
          return;
        }

        reject(new Error(String(error)));
      });
  });
}

function isInitializeParams(value: unknown): value is InitializeParams {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const maybeParams = value as InitializeParams;
  return typeof maybeParams.protocolVersion === 'string';
}

function isProtocolVersionSupported(protocolVersion: string): boolean {
  return isSupportedProtocolVersion(protocolVersion);
}

function negotiateProtocolVersion(protocolVersion: string): string {
  // The initialize request carries the client's most preferred version.
  return protocolVersion;
}

/**
 * Generates an ephemeral cryptographic or entropy-based identifier tightly scoped to tracing individual JSON-RPC requests.
 *
 * @param counter - The uniformly incremented local server interaction count.
 * @returns A unique correlation scalar tracking identifier.
 */
function generateCorrelationId(counter: number): string {
  return `req-${counter}-${Date.now().toString(36)}`;
}

/**
 * Assembles and initializes the core Model Context Protocol (MCP) server instance.
 * Manages protocol handshakes, strict request validation, sophisticated lifecycle management,
 * and orchestrates tool execution mapping against a securely controlled registry.
 *
 * @param config - The deeply validated and merged runtime server configuration.
 * @returns An initialized dispatch controller ready to process raw JSON-RPC requests.
 */
export function createMcpServer(config: RuntimeConfig) {
  const configuredToolsets = config.toolsets ?? [];
  const configuredEnabledTools = config.enabledTools ?? [];

  let toolRegistry = createToolRegistry({
    ...(config.toolsConfigPath ? { externalConfigPath: config.toolsConfigPath } : {}),
    ...(configuredToolsets.length > 0 ? { activeToolsets: configuredToolsets } : {}),
    ...(configuredEnabledTools.length > 0 ? { enabledTools: configuredEnabledTools } : {}),
    pageSize: config.limits.toolsPageSize,
  });
  const telemetry = createTelemetryRecorder(config.telemetry);

  const state: McpServerState = {
    hasInitializedHandshake: false,
    isInitialized: false,
    requestCounter: 0,
    telemetryContext: {
      clientProfile: config.telemetry.clientProfile,
      clientName: undefined,
      clientVersion: undefined,
    },
    inFlightRequests: new Map(),
  };

  function getTelemetryAttributes(
    attributes?: Record<string, string | number | boolean>,
  ): Record<string, string | number | boolean> {
    const baseAttributes: Record<string, string | number | boolean> = {
      ...(state.telemetryContext.clientProfile
        ? {
            clientProfile: state.telemetryContext.clientProfile,
          }
        : {}),
      ...(state.telemetryContext.clientName
        ? {
            clientName: state.telemetryContext.clientName,
          }
        : {}),
      ...(state.telemetryContext.clientVersion
        ? {
            clientVersion: state.telemetryContext.clientVersion,
          }
        : {}),
      ...(attributes ?? {}),
    };

    return baseAttributes;
  }

  logger.info('MCP server created', {
    transport: config.mcpTransport,
    firebirdHost: config.firebird.host,
    firebirdPort: config.firebird.port,
  });

  function handleInitialize(request: JsonRpcRequest): JsonRpcResponse {
    const requestId = getRequestId(request);

    if (state.hasInitializedHandshake) {
      return errorResponse(
        requestId,
        toJsonRpcErrorObject(new InvalidParamsError('initialize already completed')),
      );
    }

    if (!isInitializeParams(request.params)) {
      return errorResponse(requestId, toJsonRpcErrorObject(new InvalidParamsError()));
    }

    if (!isProtocolVersionSupported(request.params.protocolVersion)) {
      return errorResponse(
        requestId,
        toJsonRpcErrorObject(
          new InvalidParamsError(
            `unsupported protocol version '${request.params.protocolVersion}', supported versions: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}`,
          ),
        ),
      );
    }

    const negotiatedProtocolVersion = negotiateProtocolVersion(request.params.protocolVersion);

    logger.info('MCP initialize', {
      clientProtocolVersion: request.params.protocolVersion,
      serverProtocolVersion: negotiatedProtocolVersion,
      clientName: request.params.clientInfo?.name,
      clientVersion: request.params.clientInfo?.version,
    });
    state.telemetryContext.clientName = request.params.clientInfo?.name;
    state.telemetryContext.clientVersion = request.params.clientInfo?.version;
    if (!state.telemetryContext.clientProfile && request.params.clientInfo?.name) {
      state.telemetryContext.clientProfile = request.params.clientInfo.name;
    }
    telemetry.incrementCounter('mcp.initialize.success', 1, {
      protocolVersion: request.params.protocolVersion,
      ...getTelemetryAttributes(),
    });

    const packageInfo = getPackageInfo();
    state.hasInitializedHandshake = true;

    return resultResponse(requestId, {
      protocolVersion: negotiatedProtocolVersion,
      capabilities: {
        tools: { listChanged: true },
      },
      serverInfo: {
        name: packageInfo.name,
        version: packageInfo.version,
      },
    });
  }

  function handleNotification(request: JsonRpcRequest): null {
    if (request.method === 'notifications/initialized') {
      if (!state.hasInitializedHandshake) {
        logger.warning('Initialized notification ignored before initialize');
        return null;
      }

      state.isInitialized = true;
      logger.info('MCP initialized — server ready');
      telemetry.incrementCounter('mcp.initialized.notification', 1, getTelemetryAttributes());
    }

    if (request.method === 'notifications/cancelled') {
      handleCancellation(request);
    }

    return null;
  }

  function handleCancellation(request: JsonRpcRequest): void {
    if (!isRecord(request.params)) {
      return;
    }

    const requestId = request.params.requestId;
    if (requestId === undefined || requestId === null) {
      return;
    }

    const key = requestId as string | number;
    const controller = state.inFlightRequests.get(key);
    if (controller) {
      logger.info('Cancelling in-flight request', { cancelledRequestId: key });
      controller.abort();
      state.inFlightRequests.delete(key);
    }
  }

  function handleToolsList(request: JsonRpcRequest): JsonRpcResponse {
    const requestId = getRequestId(request);
    const span = telemetry.startSpan('mcp.tools.list', getTelemetryAttributes());

    let cursor: string | undefined;
    if (isRecord(request.params)) {
      const maybeCursor = request.params.cursor;
      if (typeof maybeCursor === 'string') {
        cursor = maybeCursor;
      }
    }

    const result = toolRegistry.getToolDefinitions(cursor);
    telemetry.incrementCounter('mcp.tools.list.success', 1, {
      toolCount: result.tools.length,
      ...getTelemetryAttributes(),
    });
    span.end('ok', { toolCount: result.tools.length });

    return resultResponse(requestId, {
      tools: result.tools,
      ...(result.nextCursor !== undefined ? { nextCursor: result.nextCursor } : {}),
    });
  }

  function handleToolsReload(request: JsonRpcRequest): JsonRpcResponse {
    const requestId = getRequestId(request);
    const span = telemetry.startSpan('mcp.tools.reload', getTelemetryAttributes());

    if (!config.toolsReloadEnabled) {
      telemetry.incrementCounter('mcp.tools.reload.rejected', 1, getTelemetryAttributes());
      span.end('error', { enabled: false });
      return errorResponse(
        requestId,
        toJsonRpcErrorObject(new MethodNotFoundError('tools/reload')),
      );
    }

    toolRegistry = createToolRegistry({
      ...(config.toolsConfigPath ? { externalConfigPath: config.toolsConfigPath } : {}),
      ...(configuredToolsets.length > 0 ? { activeToolsets: configuredToolsets } : {}),
      ...(configuredEnabledTools.length > 0 ? { enabledTools: configuredEnabledTools } : {}),
      pageSize: config.limits.toolsPageSize,
    });
    telemetry.incrementCounter('mcp.tools.reload.success', 1, {
      toolCount: toolRegistry.getToolCount(),
      ...getTelemetryAttributes(),
    });
    span.end('ok', { toolCount: toolRegistry.getToolCount() });

    stdout.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/tools/listChanged', params: {} })}\n`,
    );

    return resultResponse(requestId, {
      reloaded: true,
      toolCount: toolRegistry.getToolCount(),
    });
  }

  async function handleToolsCall(
    request: JsonRpcRequest,
    correlationId: string,
  ): Promise<JsonRpcResponse> {
    const requestId = getRequestId(request);
    const span = telemetry.startSpan('mcp.tools.call', getTelemetryAttributes());

    const toolParams = getToolCallParams(request.params);
    if (!toolParams) {
      telemetry.incrementCounter('mcp.tools.call.invalid_params', 1, getTelemetryAttributes());
      span.end('error', { reason: 'invalid_params' });
      return errorResponse(requestId, toJsonRpcErrorObject(new InvalidParamsError()));
    }

    const toolName = toolParams.name;
    if (!toolName) {
      telemetry.incrementCounter('mcp.tools.call.invalid_tool_name', 1, getTelemetryAttributes());
      span.end('error', { reason: 'missing_tool_name' });
      return errorResponse(
        requestId,
        toJsonRpcErrorObject(new InvalidParamsError('tool name is required')),
      );
    }

    const handler = toolRegistry.getToolHandler(toolName);
    if (!handler) {
      logger.warning('Tool not found', { correlationId, tool: toolName });
      telemetry.incrementCounter('mcp.tools.call.tool_not_found', 1, {
        toolName,
        ...getTelemetryAttributes(),
      });
      span.end('error', { reason: 'tool_not_found', toolName });
      return errorResponse(requestId, toJsonRpcErrorObject(new ToolNotFoundError(toolName)));
    }

    const abortController = new AbortController();
    if (requestId !== null) {
      state.inFlightRequests.set(requestId, abortController);
    }

    logger.debug('Tool call start', { correlationId, tool: toolName });

    try {
      const effectiveTimeoutMs = config.toolTimeoutOverrides[toolName] ?? config.limits.timeoutMs;
      const result = await withToolTimeout(
        toolName,
        effectiveTimeoutMs,
        () => handler.execute(toolParams.arguments, { config }),
        abortController.signal,
      );

      logger.debug('Tool call complete', { correlationId, tool: toolName });
      telemetry.incrementCounter('mcp.tools.call.success', 1, {
        toolName,
        ...getTelemetryAttributes(),
      });
      span.end('ok', { toolName });

      return resultResponse(requestId, result);
    } catch (error) {
      span.end('error', { toolName });
      throw error;
    } finally {
      if (requestId !== null) {
        state.inFlightRequests.delete(requestId);
      }
    }
  }

  async function handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const requestId = getRequestId(request);
    state.requestCounter += 1;
    const correlationId = generateCorrelationId(state.requestCounter);
    telemetry.incrementCounter('mcp.request.received', 1, {
      method: request.method,
      ...getTelemetryAttributes(),
    });

    if (request.method === 'initialize') {
      return handleInitialize(request);
    }

    if (request.id === undefined) {
      return handleNotification(request);
    }

    if (!state.isInitialized) {
      logger.warning('Request before initialization', {
        correlationId,
        method: request.method,
      });
      telemetry.incrementCounter('mcp.request.before_initialized', 1, {
        method: request.method,
        ...getTelemetryAttributes(),
      });
      return errorResponse(requestId, {
        ...toJsonRpcErrorObject(new ServerNotInitializedError()),
      });
    }

    if (request.method === 'ping') {
      return resultResponse(requestId, {});
    }

    if (request.method === 'tools/list') {
      return handleToolsList(request);
    }

    if (request.method === 'tools/reload') {
      return handleToolsReload(request);
    }

    if (request.method === 'tools/call') {
      try {
        return await handleToolsCall(request, correlationId);
      } catch (error) {
        if (error instanceof McpError) {
          logger.warning('Tool call error', {
            correlationId,
            errorType: error.name,
            errorMessage: error.message,
          });
          telemetry.incrementCounter('mcp.tools.call.error', 1, {
            errorType: error.name,
            ...getTelemetryAttributes(),
          });
          return errorResponse(requestId, {
            code: error.jsonRpcCode,
            message: error.message,
          });
        }

        logger.error('Unexpected error in tool call', {
          correlationId,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        telemetry.incrementCounter('mcp.tools.call.error', 1, {
          errorType: 'unexpected',
          ...getTelemetryAttributes(),
        });
        return errorResponse(requestId, {
          code: -32603,
          message: 'Internal error',
        });
      }
    }

    return errorResponse(requestId, {
      ...toJsonRpcErrorObject(new MethodNotFoundError(request.method)),
    });
  }

  return {
    handleRequest,
  };
}
