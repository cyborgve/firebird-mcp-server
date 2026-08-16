# Architecture

## Overview

Firebird MCP Server is a TypeScript implementation of an MCP server over JSON-RPC 2.0 using `stdio` transport.

Core goals:

- Strict MCP lifecycle handling
- Safe, read-only Firebird data access
- Typed validation at tool boundaries
- Predictable runtime limits

## High-Level Components

- `src/server.ts`
  - Process bootstrap
  - `stdin` line parsing / `stdout` responses
  - Parse/validation of JSON-RPC envelope
  - Graceful shutdown and pool draining

- `src/mcp/mcp-server.ts`
  - MCP lifecycle and method routing
  - `initialize`, `tools/list`, `tools/call`
  - Timeout and cancellation handling

- `src/mcp/tools/*`
  - Tool handlers and schemas
  - Business-safe boundary for user input

- `src/db/firebird/firebird-adapter.ts`
  - Firebird connectivity and queries
  - Metadata retrieval and health status

- `src/config/env-config.ts`
  - Runtime config parsing from environment
  - Numeric bounds and defaults for limits

- `src/logging/logger.ts`
  - Structured logs in JSON to `stderr`
  - RFC 5424-compatible levels

## MCP Lifecycle

1. Client sends `initialize`.
2. Server returns negotiated protocol/capabilities.
3. Client sends `notifications/initialized`.
4. Client can call `tools/list` and `tools/call`.

If a request is sent before initialization, server returns `-32002`.

## Tool Execution Pipeline

1. Validate `tools/call` shape and tool name.
2. Resolve handler from registry.
3. Validate tool arguments with Zod.
4. Execute with configurable timeout (`MCP_TOOL_TIMEOUT_MS`).
5. Apply truncation and limits when relevant.
6. Return MCP tool result payload.

## Data Safety Model

- `execute_query` enforces read-only SQL.
- Mutating statements are blocked by SQL validator.
- Parameter count and row count are bounded.
- Errors are mapped to predictable JSON-RPC codes.

## Runtime Boundaries

- Single process over `stdio` transport
- No HTTP transport in this implementation
- Logs are separated from protocol output (`stderr` vs `stdout`)
