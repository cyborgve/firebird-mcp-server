# Cursor Smoke Validation

- Date: 2026-03-08
- Operator: AI agent (terminal session)
- Environment: Windows, terminal-only automation session
- Config File Path: Cursor MCP settings file
- Config Snippet Reference: `docs/integrations/templates/cursor.mcp.json`

## Baseline Artifact

- Stdio baseline JSON: `docs/integrations/evidence/stdio-smoke-latest.json`

## Manual Validation Results

1. `initialize`

- Status: Blocked
- Evidence: Cursor interactive MCP UI is required for this check and is not accessible from the current terminal-only session.

1. `tools/list`

- Status: Blocked
- Evidence: Cursor interactive MCP UI is required for this check and is not accessible from the current terminal-only session.

1. `tools/call ping`

- Status: Blocked
- Evidence: Cursor interactive MCP UI is required for this check and is not accessible from the current terminal-only session.

1. `tools/call list_tables`

- Status: Blocked
- Evidence: Cursor interactive MCP UI is required for this check and is not accessible from the current terminal-only session.

1. `tools/call execute_query` mutation rejection

- Status: Blocked
- Evidence: Cursor interactive MCP UI is required for this check and is not accessible from the current terminal-only session.

## Outcome

- Final status: Blocked
- Notes: `Get-Command cursor` was not found in PATH. Workspace has `.cursor/` but only rules were present before this step.
- Follow-up actions: Open Cursor, validate MCP server from `.cursor/mcp.json`, and record command outputs in this file.
