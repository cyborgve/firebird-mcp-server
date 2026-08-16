# Copilot CLI Smoke Validation

- Date: 2026-03-08
- Operator: AI agent (terminal session)
- Environment: Windows, terminal session
- Config File Path: user-level or project-level Copilot CLI MCP config
- Config Snippet Reference: `docs/integrations/templates/copilot-cli.mcp.json`

## Baseline Artifact

- Stdio baseline JSON: `docs/integrations/evidence/stdio-smoke-latest.json`

## Manual Validation Results

1. `initialize`

- Status: Blocked
- Evidence: `gh copilot --help` returned `unknown command "copilot" for "gh"`.

1. `tools/list`

- Status: Blocked
- Evidence: Copilot CLI command path unavailable, smoke sequence cannot start.

1. `tools/call ping`

- Status: Blocked
- Evidence: Copilot CLI command path unavailable, smoke sequence cannot start.

1. `tools/call list_tables`

- Status: Blocked
- Evidence: Copilot CLI command path unavailable, smoke sequence cannot start.

1. `tools/call execute_query` mutation rejection

- Status: Blocked
- Evidence: Copilot CLI command path unavailable, smoke sequence cannot start.

## Outcome

- Final status: Blocked
- Notes: `gh version 2.83.1` is available, but no Copilot command is installed. `gh extension list` reported no installed extensions.
- Follow-up actions: Install/enable Copilot CLI support for `gh` and re-run this smoke checklist.
