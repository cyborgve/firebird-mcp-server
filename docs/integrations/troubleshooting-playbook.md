# Troubleshooting Playbook

This playbook consolidates common MCP integration failures across supported editors and provides concrete diagnostics and remediations.

For deep protocol diagnostics, use the dedicated [MCP Inspector Diagnostics Workflow](./mcp-inspector-workflow.md).

## Quick Triage Flow

1. Verify project build artifacts exist: `pnpm run build`.
2. Verify runtime config uses the correct server command and path.
3. Verify Firebird environment variables are present.
4. Verify MCP lifecycle is respected: `initialize` then `notifications/initialized`.
5. Verify `tools/list` returns expected tools.

## VS Code Extension Probe Commands

Use these built-in commands before deep manual debugging:

- `Firebird MCP Server: Test Firebird MCP Connection`
  - Checks: `initialize`, `tools/list`, `tools/call ping`, and `tools/call list_tables` when available.
- `Firebird MCP Server: Test Firebird MCP Connection (Extended)`
  - Adds: `tools/call execute_query` with safe SQL (`SELECT 1 AS HEALTH FROM RDB$DATABASE`).

Interpretation guide:

- `tools/list ok`, `ping ok`, `list_tables ok`
  - MCP handshake and baseline tool path are healthy.
- `list_tables: skipped`
  - Current tool selection does not expose `list_tables`; verify `firebirdMcp.tools` and `firebirdMcp.toolsets`.
- `execute_query: skipped` in extended test
  - `execute_query` is not available in current tool selection.
- `list_tables: warning` or `execute_query: warning`
  - Server is reachable but tool execution failed; check Firebird credentials, database path, and read-only policy constraints.

If a probe fails entirely, capture the status bar state (`Starting`/`Error`) and the full command error message before proceeding.

## Global Failure Modes

### 1) Server Process Fails To Start

Symptoms:

- Editor reports server disconnected or startup timeout.
- No MCP tools appear in the editor.

Likely Causes:

- Invalid command or `args` path.
- Missing `dist/server.js` due to skipped build.
- Node runtime unavailable in PATH.

Diagnostics:

```bash
pnpm run build
node ./dist/server.js
```

If startup fails, inspect stderr output for path/module errors.

Remediation:

- Rebuild project and update the command path in MCP config.
- Ensure Node.js 24+ is installed.
- Use workspace-root relative paths consistently.

### 2) Environment Variables Missing Or Invalid

Symptoms:

- Tools run but Firebird calls fail.
- Connection/authentication errors in server logs.

Likely Causes:

- Missing `FIREBIRD_DATABASE`.
- Incorrect host, port, user, or password.
- Env variables defined in a shell but not in editor MCP config.

Diagnostics:

- Compare editor MCP config with `.env.example`.
- Validate connection variables directly in the editor config `env` block.

Remediation:

- Set all required Firebird values in editor-specific MCP config.
- Restart editor MCP client after env updates.

### 3) Protocol Lifecycle Errors

Symptoms:

- `tools/list` or `tools/call` returns errors before any tool result.
- Warnings about requests before initialization.

Likely Causes:

- Client sends requests before `initialize` and `notifications/initialized`.
- Protocol version mismatch.

Diagnostics:

- Capture request/response trace in the editor MCP inspector.
- Confirm order: `initialize` -> `notifications/initialized` -> `tools/list`.

Remediation:

- Update client configuration to follow MCP lifecycle ordering.
- Align client/server protocol version with `2025-06-18` where applicable.

### 4) Tool Missing In `tools/list`

Symptoms:

- Expected tool does not appear in tool catalog.

Likely Causes:

- Wrong server instance or stale cached config.
- Startup failure before tool registration.

Diagnostics:

- Restart editor and reload MCP config.
- Re-run `tools/list` and compare with expected set.

Expected set:

- `ping`
- `server_status`
- `list_tables`
- `get_table_schema`
- `get_database_schema`
- `execute_query`

Remediation:

- Ensure the correct project and config file are active.
- Clear editor MCP cache if supported by the client.

### 5) `execute_query` Rejected

Symptoms:

- `execute_query` returns read-only policy violations.

Likely Causes:

- Non-read-only SQL (UPDATE/INSERT/DELETE/DDL).
- Multi-statement payloads.

Diagnostics:

- Check SQL text sent by the editor.
- Validate query is `SELECT`/CTE only.

Remediation:

- Use read-only SQL statements.
- Split mixed statements into separate safe operations.

## Editor-Specific Notes

### VS Code (Copilot)

- Confirm MCP server entry is in the expected VS Code MCP config.
- Check VS Code output logs for process spawn and stderr messages.

### Copilot CLI

- Run from repository root so relative paths resolve correctly.
- If command not found, verify Copilot CLI MCP support is enabled.

### Cursor

- Validate active workspace and MCP configuration file scope.
- Reload Cursor after changing MCP config.

### Cline

- Ensure Cline is pointing to the same workspace where `dist/server.js` exists.
- Reopen MCP panel after config updates.

### Gemini CLI

- Confirm `.gemini/settings.json` is loaded from current working directory.
- Restart CLI session after MCP config changes.

### Gemini Code Assist

- Verify MCP settings are applied to the active workspace profile.
- Re-enable agent mode after configuration updates.

### Claude Desktop

- Restart Claude Desktop after config edits.
- Ensure config file JSON is valid (no trailing commas).

### Claude Code

- Confirm `.mcp.json` is present in project root.
- Restart Claude Code session to reload server registration.

### Windsurf

- Verify MCP settings are workspace-scoped and not overridden globally.
- Reload workspace to refresh tool registration.

### Antigravity

- Reload agent profile after updating MCP config.
- Confirm tool registry shows Firebird server as connected.

## Escalation Checklist

If issues persist, collect and attach:

- Editor name and version.
- MCP config used (with secrets redacted).
- Build output from `pnpm run build`.
- Relevant stderr logs from MCP server.
- `initialize` and `tools/list` trace snippets.
