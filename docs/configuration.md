# Configuration

This document describes runtime configuration for Firebird MCP Server.

## Environment Variables

### Firebird Connection

- `FIREBIRD_HOST` (default: `127.0.0.1`)
- `FIREBIRD_PORT` (default: `3050`)
- `FIREBIRD_DATABASE` (required for real usage)
- `FIREBIRD_USER` (default: `SYSDBA`)
- `FIREBIRD_PASSWORD` (default: `masterkey`)
- `FIREBIRD_ROLE` (optional)
- `FIREBIRD_CHARSET` (default: `UTF8`)

### Tool Limits

- `MCP_TOOL_TIMEOUT_MS` (default: `10000`, bounded `1000..120000`)
- `MCP_LIST_TABLES_MAX_ITEMS` (default: `500`, bounded `1..10000`)
- `MCP_SCHEMA_MAX_TABLES` (default: `200`, bounded `1..5000`)
- `MCP_SCHEMA_MAX_COLUMNS_PER_TABLE` (default: `300`, bounded `1..2000`)
- `MCP_EXECUTE_QUERY_MAX_ROWS` (default: `200`, bounded `1..10000`)
- `MCP_EXECUTE_QUERY_MAX_PARAMS` (default: `50`, bounded `0..500`)
- `MCP_EXECUTE_QUERY_MODE` (default: `safe`, allowed: `safe`, `ad-hoc`)
- `MCP_EXECUTE_QUERY_ALLOWED_IDENTIFIERS` (default: empty, comma-separated allowlist for `{{identifier}}` substitutions)
- `MCP_TOOLS_CONFIG_PATH` (optional path to external tools config file: `.json`, `.yaml`, `.yml`)
- `MCP_TOOLSET` (optional built-in profile: `readonly`, `schema`, `ops`)
- `MCP_TOOLSETS` (optional comma-separated built-in profiles; merged with `MCP_TOOLSET`)
- `MCP_TOOLS` (optional comma-separated explicit allowlist of tool names)
- `MCP_TOOLS_RELOAD_ENABLED` (default: `false`, allows runtime `tools/reload`)

### Transport Selection

- `MCP_TRANSPORT` (default: `stdio`, allowed: `stdio`, `http`)

When `MCP_TRANSPORT=http`, the following variables apply:

- `MCP_HTTP_HOST` (default: `127.0.0.1`)
- `MCP_HTTP_PORT` (default: `3000`, bounded `1..65535`)
- `MCP_HTTP_PATH` (default: `/mcp`)
- `MCP_HTTP_ALLOWED_ORIGINS` (default: empty, comma-separated explicit allowlist)
- `MCP_HTTP_REQUIRE_AUTH` (default: `false` on loopback hosts, forced `true` on non-local host)
- `MCP_HTTP_AUTH_TOKEN` (required when host is non-local)
- `MCP_HTTP_ENFORCE_PROTOCOL_VERSION` (default: `true`)

## Example

```bash
FIREBIRD_HOST=127.0.0.1
FIREBIRD_PORT=3050
FIREBIRD_DATABASE=/data/example.fdb
FIREBIRD_USER=readonly_user
FIREBIRD_PASSWORD=change_me
FIREBIRD_CHARSET=UTF8

MCP_TOOL_TIMEOUT_MS=15000
MCP_EXECUTE_QUERY_MAX_ROWS=500
MCP_EXECUTE_QUERY_MAX_PARAMS=20
MCP_EXECUTE_QUERY_MODE=safe
MCP_EXECUTE_QUERY_ALLOWED_IDENTIFIERS=USERS,ORDERS
MCP_TOOLS_CONFIG_PATH=./config/tools.json
MCP_TOOLSET=readonly
MCP_TOOLSETS=readonly,schema
MCP_TOOLS=ping,list_tables
MCP_TOOLS_RELOAD_ENABLED=false

MCP_TRANSPORT=http
MCP_HTTP_HOST=127.0.0.1
MCP_HTTP_PORT=3000
MCP_HTTP_PATH=/mcp
MCP_HTTP_ALLOWED_ORIGINS=http://localhost:3000
MCP_HTTP_REQUIRE_AUTH=true
MCP_HTTP_AUTH_TOKEN=change_me_http_bearer
MCP_HTTP_ENFORCE_PROTOCOL_VERSION=true
```

## Operational Notes

- Invalid numeric values fall back to defaults.
- Out-of-range numeric values are clamped to safe bounds.
- Empty `FIREBIRD_ROLE` is treated as not set.
- Invalid `MCP_EXECUTE_QUERY_MODE` values fall back to `safe`.
- Identifier allowlist entries are normalized to uppercase and deduplicated.
- Invalid or missing external tools config falls back to the built-in static tool registry.
- Unknown `MCP_TOOLSET` values are ignored and current selection is preserved.
- Unknown `MCP_TOOLSETS` values are ignored and any valid profiles are merged.
- `MCP_TOOLS` can further narrow the active tool list after toolset filtering.
- `tools/reload` is available only when `MCP_TOOLS_RELOAD_ENABLED=true`.
- For `MCP_TRANSPORT=http` and non-local bind (`MCP_HTTP_HOST` not loopback), startup fails unless `MCP_HTTP_AUTH_TOKEN` is provided.
- `MCP_HTTP_PATH` is normalized to start with `/`.

## Built-In Toolsets

- `readonly`: `ping`, `server_status`, `list_tables`, `get_table_schema`, `get_database_schema`
- `schema`: `ping`, `server_status`, `list_tables`, `get_table_schema`, `get_database_schema`
- `ops`: `ping`, `server_status`

Toolset filtering is applied after optional external file filtering, so it can further reduce the active tool list.

## Controlled Reload

When `MCP_TOOLS_RELOAD_ENABLED=true`, clients can call:

```json
{
  "jsonrpc": "2.0",
  "id": 42,
  "method": "tools/reload"
}
```

The server reloads external tool configuration and reapplies toolset filtering without a process restart.

## External Tools Config File

JSON example (`tools.json`):

```json
{
  "enabledTools": ["ping", "list_tables", "execute_query"]
}
```

YAML example (`tools.yaml`):

```yaml
enabledTools:
  - ping
  - list_tables
  - execute_query
```

## Security Recommendations

- Use least-privilege read-only DB credentials.
- Never commit real secrets.
- Keep environment-specific values outside version control.

## Secure Profile Guidance

For production-like environments:

- Prefer `MCP_TRANSPORT=http` behind TLS termination.
- Bind to non-local host only with `MCP_HTTP_AUTH_TOKEN` configured.
- Keep `MCP_HTTP_REQUIRE_AUTH=true` and `MCP_HTTP_ENFORCE_PROTOCOL_VERSION=true`.
- Set explicit `MCP_HTTP_ALLOWED_ORIGINS` instead of relying on defaults.
- Store all tokens/passwords in a secret manager and inject at runtime.
