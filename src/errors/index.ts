/**
 * The foundational abstract error class for all Model Context Protocol (MCP) exceptions.
 * Enforces the inclusion of a valid JSON-RPC 2.0 error code for standardized protocol-level error mapping.
 */
export abstract class McpError extends Error {
  public abstract readonly jsonRpcCode: number;

  protected constructor(message: string) {
    super(message);
    this.name = 'McpError';
  }
}

/**
 * Signifies a protocol violation where a client attempts to execute operations prior to a successful `initialize` handshake.
 * Maps to JSON-RPC error code: `-32002`.
 */
export class ServerNotInitializedError extends McpError {
  public readonly jsonRpcCode = -32002;

  public constructor() {
    super('Server not initialized');
    this.name = 'ServerNotInitializedError';
  }
}

/**
 * Indicates that the requested JSON-RPC method is not supported or recognized by this server implementation.
 * Maps to JSON-RPC error code: `-32601`.
 */
export class MethodNotFoundError extends McpError {
  public readonly jsonRpcCode = -32601;

  public constructor(method: string) {
    super(`Method not found: ${method}`);
    this.name = 'MethodNotFoundError';
  }
}

/**
 * Identifies a structural or semantic validation failure within the provided JSON-RPC parameters.
 * Maps to JSON-RPC error code: `-32602`.
 */
export class InvalidParamsError extends McpError {
  public readonly jsonRpcCode = -32602;

  public constructor(detail?: string) {
    super(detail ? `Invalid params: ${detail}` : 'Invalid params');
    this.name = 'InvalidParamsError';
  }
}

/**
 * Thrown when a client attempts to invoke a registered MCP tool that does not exist in the current tool registry.
 * Maps to JSON-RPC error code: `-32601`.
 */
export class ToolNotFoundError extends McpError {
  public readonly jsonRpcCode = -32601;

  public constructor(toolName: string) {
    super(`Tool not found: ${toolName}`);
    this.name = 'ToolNotFoundError';
  }
}

/**
 * Represents an operational timeout where a tool execution exceeded its rigorously allocated execution window.
 * Maps to JSON-RPC error code: `-32008`.
 */
export class ToolTimeoutError extends McpError {
  public readonly jsonRpcCode = -32008;

  public constructor(toolName: string, timeoutMs: number) {
    super(`Tool '${toolName}' timed out after ${timeoutMs}ms`);
    this.name = 'ToolTimeoutError';
  }
}

/**
 * Represents an explicit tool cancellation requested by the client through `notifications/cancelled`.
 * Maps to JSON-RPC error code: `-32800` (request cancelled).
 */
export class ToolCancelledError extends McpError {
  public readonly jsonRpcCode = -32800;

  public constructor(toolName: string) {
    super(`Tool '${toolName}' was cancelled`);
    this.name = 'ToolCancelledError';
  }
}

/**
 * Triggered by the SQL validator when a query attempts to perform non-read-only operations (e.g., INSERT, UPDATE, DELETE).
 * Maps to JSON-RPC error code: `-32003`.
 */
export class ReadOnlyPolicyError extends McpError {
  public readonly jsonRpcCode = -32003;

  public constructor() {
    super('Read-only policy violation: only SELECT/CTE queries are allowed');
    this.name = 'ReadOnlyPolicyError';
  }
}

/**
 * Denotes a failure in Zod payload validation during a tool invocation, implying malformed tool arguments.
 * Maps to JSON-RPC error code: `-32602`.
 */
export class ToolValidationError extends McpError {
  public readonly jsonRpcCode = -32602;

  public constructor(detail: string) {
    super(`Invalid params: ${detail}`);
    this.name = 'ToolValidationError';
  }
}
