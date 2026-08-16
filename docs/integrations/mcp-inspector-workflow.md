# MCP Inspector Diagnostics Workflow

This workflow standardizes how to diagnose MCP transport and method failures using MCP Inspector.

## Purpose

Use MCP Inspector when you need to debug:

- Lifecycle ordering issues (`initialize` and `notifications/initialized`)
- Missing tools in `tools/list`
- `tools/call` failures and response payload structure
- JSON-RPC error mapping (`-32601`, `-32602`, `-32603`, `-32002`)

## Prerequisites

- Built server artifacts:

```bash
pnpm run build
```

- Server start command:

```bash
node ./dist/server.js
```

- Runtime environment variables configured (especially Firebird connection values).

## Step 1: Start MCP Inspector

Start MCP Inspector and register this server with stdio transport:

- Command: `node`
- Arguments: `./dist/server.js`
- Working directory: repository root
- Environment: include Firebird and MCP variables used in production-like configuration

## Step 2: Validate Lifecycle

Run these requests in order:

1. `initialize` with `protocolVersion: 2025-06-18`
2. `notifications/initialized`
3. `tools/list`

Expected result:

- `initialize`: success with server capabilities
- `notifications/initialized`: no response (notification)
- `tools/list`: tool catalog payload

If `tools/list` fails with `-32002`, lifecycle order is incorrect.

## Step 3: Validate Core Tool Path

Execute:

1. `tools/call` -> `ping`
2. `tools/call` -> `list_tables`
3. Optional: `tools/call` -> `execute_query` with `SELECT 1 AS HEALTH FROM RDB$DATABASE`

Expected result:

- `ping`: status payload with connectivity context
- `list_tables`: list payload (possibly empty when DB is not configured)
- `execute_query`: read-only response structure, or policy error if SQL is unsafe

## Step 4: Validate Dynamic Tool Controls

When using dynamic tool configuration:

- `MCP_TOOLS_CONFIG_PATH`
- `MCP_TOOLSET`
- `MCP_TOOLS_RELOAD_ENABLED`

Check:

1. Run `tools/list` and confirm visible tools match the selected profile.
2. If reload is enabled, modify tools config file and call `tools/reload`.
3. Run `tools/list` again to verify refreshed tool catalog.

Expected result:

- `tools/reload` succeeds only when `MCP_TOOLS_RELOAD_ENABLED=true`.
- Filtered tools are hidden from both `tools/list` and `tools/call`.

## Step 5: Failure Interpretation

- `-32601` on `tools/reload`: reload is disabled or method not exposed.
- `-32601` on `tools/call`: tool is not registered in the active selection.
- `-32602`: invalid argument shape.
- `-32603`: unexpected internal error; check `stderr` logs.
- `-32003`: read-only SQL policy violation.
- `-32008`: tool timeout or cancellation.

## Evidence Checklist

When escalating an issue, attach:

- MCP Inspector request/response transcript (initialize, tools/list, failing tools/call)
- Active environment variable set (secrets redacted)
- Current `tools.json`/`tools.yaml` if used
- `stderr` log excerpt around the failing request
- Server build output (`pnpm run build`)
