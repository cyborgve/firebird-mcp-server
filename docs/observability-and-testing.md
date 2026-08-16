# Observability and Testing

## Logging

The project logs structured JSON entries to `stderr`.

Supported levels:

- `debug`
- `info`
- `warning`
- `error`

## Telemetry

The server includes lightweight MCP telemetry counters and spans.

Configuration:

- `MCP_TELEMETRY_ENABLED` (`false` by default)
- `MCP_TELEMETRY_EXPORTER` (`logs` or `none`)
- `MCP_TELEMETRY_MAX_STORED_SPANS` (bounded `10..5000`)
- `MCP_TELEMETRY_CLIENT_PROFILE` (optional static client/editor segment)

Coverage includes:

- Lifecycle events (`initialize`, initialized notification)
- Request intake and pre-initialization rejections
- Tool listing, tool reload, and tool call execution paths
- Tool call success/error counters and span durations
- Deterministic behavior for `enabled=false` and `exporter=none`

Telemetry dimensions:

- `clientProfile` from `MCP_TELEMETRY_CLIENT_PROFILE` (or initialize client name fallback)
- `clientName` and `clientVersion` from initialize `clientInfo`

Dimension stability note:

- Keep metric/span label keys low-cardinality (`clientProfile`, `toolName`, `errorType`, `method`).
- Avoid high-cardinality user/request identifiers in telemetry dimensions; use logs/traces for deep diagnostics.

Recommended profile values:

- `vscode`
- `copilot-cli`
- `cursor`
- `cline`
- `gemini-cli`
- `gemini-code-assist`
- `claude-desktop`
- `claude-code`
- `windsurf`
- `antigravity`

### Sample Segmentation Queries

When `MCP_TELEMETRY_EXPORTER=logs`, telemetry events are emitted as JSON lines on `stderr`.

Count tool-call errors by client profile:

```bash
cat server.log \
 | jq -r 'select(.message == "Telemetry event" and .telemetryKind == "metric" and .metricName == "mcp.tools.call.error") | .attributes.clientProfile // "unknown"' \
 | sort \
 | uniq -c
```

Count initialize success by client profile:

```bash
cat server.log \
 | jq -r 'select(.message == "Telemetry event" and .telemetryKind == "metric" and .metricName == "mcp.initialize.success") | .attributes.clientProfile // "unknown"' \
 | sort \
 | uniq -c
```

Approximate average tool-call latency by client profile (from spans):

```bash
cat server.log \
 | jq -r 'select(.message == "Telemetry event" and .telemetryKind == "span" and .spanName == "mcp.tools.call") | [(.attributes.clientProfile // "unknown"), (.spanDurationMs | tostring)] | @tsv' \
 | awk -F'\t' '{sum[$1]+=$2; count[$1]++} END {for (k in sum) printf "%s\t%.2fms\n", k, sum[k]/count[k]}'
```

### Dashboard Examples

- Error rate by client profile:
  - Filter metric: `mcp.tools.call.error`
  - Group by: `attributes.clientProfile`
- P95 tool-call latency by client profile:
  - Filter span: `mcp.tools.call`
  - Aggregation: percentile `95` on `spanDurationMs`
  - Group by: `attributes.clientProfile`
- Initialization success trend by client profile:
  - Filter metric: `mcp.initialize.success`
  - Group by: `attributes.clientProfile`
  - Time bucket: `1m` or `5m`

Important transport rule:

- `stdout` is reserved for MCP JSON-RPC messages.
- `stderr` is reserved for logs.

## What to Monitor

- Initialization failures (`initialize` / lifecycle misuse)
- Tool validation failures (`-32602`)
- Timeouts (`MCP_TOOL_TIMEOUT_MS` reached)
- Unexpected internal errors (`-32603`)

For request/response-level protocol debugging, see [MCP Inspector Diagnostics Workflow](integrations/mcp-inspector-workflow.md).

## Test Commands

```bash
pnpm run test
pnpm run test:watch
```

## Build and Lint Commands

```bash
pnpm run lint
pnpm run build
```

## Test Scope in Repository

Tests cover key areas including:

- MCP server behavior
- Tool registry and tool handlers
- SQL read-only validation
- Runtime config parsing
- Logger behavior

## Suggested CI Sequence

1. Install dependencies
2. Lint
3. Run tests
4. Build
