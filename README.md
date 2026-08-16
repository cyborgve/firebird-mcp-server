# Firebird MCP Server

TypeScript MCP server for FirebirdSQL, implementing JSON-RPC 2.0 over `stdio` with safe read-only query execution by default and schema introspection tools.

## Highlights

- MCP lifecycle support (`initialize` -> `notifications/initialized`)
- Tool catalog with pagination (`tools/list`)
- Tool execution via `tools/call`
- Safe SQL mode for query execution (read-only by default, explicit ad-hoc opt-in)
- Runtime limits for timeout, rows, tables, and parameters
- Structured JSON logging to `stderr`
- Graceful shutdown and in-flight request draining

## Requirements

- Node.js `>=24.0.0`
- pnpm `>=10.5.2`
- FirebirdSQL `2.5` to `5.x`

## Quickstart

1. Install dependencies:

```bash
pnpm install
```

1. Configure environment:

```bash
cp .env.example .env
```

1. Build:

```bash
pnpm run build
```

1. Run:

```bash
pnpm run start
```

## VS Code Extension

This project includes a VS Code extension that provides a GUI wrapper for the MCP server.

### Installation

Install the "Firebird MCP Server" extension from the VS Code Marketplace.

### Configuration

Configure the database connection in VS Code settings (`firebirdMcp.*`):

- `host`: Database host (default: localhost)
- `database`: Database path or alias
- `port`: Database port (default: 3050)
- `user`: Database user (default: SYSDBA)
- `readOnly`: Enable read-only mode (default: false)
- `autoStart`: Auto-start server on extension activation (default: false)

Use the command palette (`Ctrl+Shift+P`) and run "Set Firebird Password" to securely store the password.

### Commands

- `Firebird MCP Server: Start Server`
- `Firebird MCP Server: Stop Server`
- `Firebird MCP Server: Server Status`
- `Firebird MCP Server: Set Password`
- `Firebird MCP Server: Test Firebird MCP Connection`
- `Firebird MCP Server: Test Firebird MCP Connection (Extended)`

The server logs are available in the "Firebird MCP" output channel.
The extension also exposes a status indicator with `Starting`, `Ready`, `Error`, and `Stopped` states.

## Environment Variables

Core variables are documented in `.env.example`.

Required for real connectivity:

- `FIREBIRD_DATABASE`
- `FIREBIRD_PASSWORD` (required when `FIREBIRD_DATABASE` is configured)

Commonly adjusted limits:

- `MCP_TOOL_TIMEOUT_MS`
- `MCP_EXECUTE_QUERY_MAX_ROWS`
- `MCP_EXECUTE_QUERY_MAX_PARAMS`
- `MCP_EXECUTE_QUERY_MODE` (`safe` by default, `ad-hoc` only when explicitly enabled)
- `MCP_EXECUTE_QUERY_ALLOWED_IDENTIFIERS` (comma-separated allowlist for `{{identifier}}` templates)
- `MCP_TOOLS_CONFIG_PATH` (optional external tool selection file: `.json`, `.yaml`, `.yml`)
- `MCP_TOOLSET` (optional built-in profile: `readonly`, `schema`, `ops`)
- `MCP_TOOLS_RELOAD_ENABLED` (default: `false`, enables `tools/reload`)
- `MCP_TELEMETRY_ENABLED` (default: `false`, emits MCP telemetry)
- `MCP_TELEMETRY_EXPORTER` (`logs` or `none`)
- `MCP_TELEMETRY_MAX_STORED_SPANS` (default: `200`, bounded `10..5000`)
- `MCP_TELEMETRY_CLIENT_PROFILE` (optional static segmentation label such as `vscode`, `cursor`, `claude`)
- `MCP_HTTP_MAX_BODY_BYTES` (default: `1048576`, bounded `1024..10485760`)

## MCP Usage

After process start, communicate through `stdin/stdout` JSON lines.

1. Send `initialize`
2. Send `notifications/initialized`
3. Use `tools/list` and `tools/call`

Example tool call:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "execute_query",
    "arguments": {
      "sql": "SELECT * FROM CUSTOMERS WHERE ID = ?",
      "params": [123]
    }
  }
}
```

## Available Tools

- `ping`
- `server_status`
- `list_tables`
- `get_table_schema`
- `get_database_schema`
- `execute_query`
- `explain_query_plan`
- `list_indexes`
- `list_constraints`
- `database_overview`

## Development

```bash
pnpm run lint
pnpm run test
pnpm run build
```

## Release Workflow

Create commits with commitizen:

```bash
pnpm run commit
```

Generate a versioned release:

```bash
pnpm run release
```

## Documentation

- [Docs Index](docs/README.md)
- [Master Plan Backlog](docs/MASTER-PLAN-BACKLOG.md)
- [Baseline And Acceptance](docs/BASELINE-AND-ACCEPTANCE.md)
- [MCP Compatibility Checklist](docs/MCP-COMPATIBILITY-CHECKLIST.md)
- [Editor Integrations](docs/integrations/README.md)
- [Editor Smoke Test Matrix](docs/integrations/smoke-test-matrix.md)
- [Editor Troubleshooting Playbook](docs/integrations/troubleshooting-playbook.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Configuration](docs/CONFIGURATION.md)
- [Integration Guide](docs/integration-guide.md)
- [Usage Examples](docs/usage-examples.md)
- [Security and Limits](docs/security-and-limits.md)
- [Observability and Testing](docs/observability-and-testing.md)
- [Deployment](docs/DEPLOYMENT.md)
- [FAQ](docs/faq.md)
- [Contributing](CONTRIBUTING.md)
