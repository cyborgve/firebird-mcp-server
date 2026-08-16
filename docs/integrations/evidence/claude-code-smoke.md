# Claude Code Smoke Validation

- Date: 2026-03-08
- Operator: AI agent (terminal session)
- Environment: Windows, terminal session
- Config File Path: `.mcp.json` (project root)
- Config Snippet Reference: `docs/integrations/templates/claude-code.mcp.json`

## Baseline Artifact

- Stdio baseline JSON: `docs/integrations/evidence/stdio-smoke-latest.json`

## Manual Validation Results

1. `initialize`

- Status: Blocked
- Evidence: `claude` CLI command not found in PATH.

1. `tools/list`

- Status: Blocked
- Evidence: Claude Code command path unavailable, smoke sequence cannot start.

1. `tools/call ping`

- Status: Blocked
- Evidence: Claude Code command path unavailable, smoke sequence cannot start.

1. `tools/call list_tables`

- Status: Blocked
- Evidence: Claude Code command path unavailable, smoke sequence cannot start.

1. `tools/call execute_query` mutation rejection

- Status: Blocked
- Evidence: Claude Code command path unavailable, smoke sequence cannot start.

## Outcome

- Final status: Blocked
- Notes: `Get-Command claude` returned missing.
- Follow-up actions: Install/enable Claude Code CLI, configure `.mcp.json`, and re-run smoke.
