# Windsurf Smoke Validation

- Date: 2026-03-08
- Operator: AI agent (terminal session)
- Environment: Windows, terminal-only automation session
- Config File Path: Windsurf MCP configuration
- Config Snippet Reference: `docs/integrations/templates/windsurf.mcp.json`

## Baseline Artifact

- Stdio baseline JSON: `docs/integrations/evidence/stdio-smoke-latest.json`

## Manual Validation Results

1. `initialize`

- Status: Blocked
- Evidence: `windsurf` CLI command not found in PATH; smoke requires interactive app/chat session.

1. `tools/list`

- Status: Blocked
- Evidence: Windsurf interactive app/chat session required.

1. `tools/call ping`

- Status: Blocked
- Evidence: Windsurf interactive app/chat session required.

1. `tools/call list_tables`

- Status: Blocked
- Evidence: Windsurf interactive app/chat session required.

1. `tools/call execute_query` mutation rejection

- Status: Blocked
- Evidence: Windsurf interactive app/chat session required.

## Outcome

- Final status: Blocked
- Notes: `Get-Command windsurf` returned missing in this environment.
- Follow-up actions: Open Windsurf with workspace config and execute smoke checks from chat.
