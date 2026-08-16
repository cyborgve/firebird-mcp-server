# Cline Smoke Validation

- Date: 2026-03-08
- Operator: AI agent (terminal session)
- Environment: Windows, terminal-only automation session
- Config File Path: Cline MCP configuration
- Config Snippet Reference: `docs/integrations/templates/cline.mcp.json`

## Baseline Artifact

- Stdio baseline JSON: `docs/integrations/evidence/stdio-smoke-latest.json`

## Manual Validation Results

1. `initialize`

- Status: Blocked
- Evidence: `cline` CLI command not found in PATH; Cline MCP panel checks require interactive UI.

1. `tools/list`

- Status: Blocked
- Evidence: Cline MCP panel checks require interactive UI.

1. `tools/call ping`

- Status: Blocked
- Evidence: Cline MCP panel checks require interactive UI.

1. `tools/call list_tables`

- Status: Blocked
- Evidence: Cline MCP panel checks require interactive UI.

1. `tools/call execute_query` mutation rejection

- Status: Blocked
- Evidence: Cline MCP panel checks require interactive UI.

## Outcome

- Final status: Blocked
- Notes: `Get-Command cline` returned missing in this environment.
- Follow-up actions: Open Cline in VS Code and execute the smoke sequence from `docs/integrations/cline.md`.
