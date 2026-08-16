import type { RuntimeConfig } from '../../config/env-config';

/**
 * Strictly defines the input validation payload definition schema (adopting an expected JSON Schema subset) for the specified tool.
 */
export interface McpToolInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
}

/**
 * Optional MCP tool behavior hints to help clients reason about safe tool usage.
 */
export interface McpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/**
 * Outlines the high-level, client-facing descriptive semantics enumerating a tool's capabilities.
 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: McpToolInputSchema;
  annotations?: McpToolAnnotations;
  metadata?: Record<string, unknown>;
}

/**
 * A discrete element of textual formatted content originating dynamically from an isolated tool execution pipeline.
 */
export interface McpToolTextContent {
  type: 'text';
  text: string;
}

/**
 * Represents the finalized aggregated outcome successfully formulated during a tool's execution lifecycle.
 */
export interface McpToolResult {
  content: McpToolTextContent[];
  isError?: boolean;
}

/**
 * Exposes the application-wide securely resolved global configuration and environment context strictly during individual tool invocations.
 */
export interface McpToolContext {
  config: RuntimeConfig;
  abortSignal?: AbortSignal;
}

/**
 * Specifies the rigorous architectural contract any executable MCP tool handler must implement.
 *
 * Enforces declarative registration metadata alongside strictly typed asymmetric asynchronous execution primitives.
 */
export interface McpToolHandler {
  readonly definition: McpToolDefinition;
  execute(
    args: Record<string, unknown> | undefined,
    context: McpToolContext,
  ): Promise<McpToolResult>;
}
