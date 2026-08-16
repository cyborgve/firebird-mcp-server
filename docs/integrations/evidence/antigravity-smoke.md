# Antigravity Smoke Validation

- Date: 2026-03-08
- Operator: AI agent (terminal session)
- Environment: Windows, terminal-only automation session
- Config File Path: Antigravity MCP configuration
- Config Snippet Reference: `docs/integrations/templates/antigravity.mcp.json`

## Baseline Artifact

- Stdio baseline JSON: `docs/integrations/evidence/stdio-smoke-latest.json`

## Manual Validation Results

1. `initialize`

- Status: Blocked
- Evidence: `antigravity` CLI is available, but tool-call verification requires interactive chat/session output not exposed as deterministic non-interactive MCP transcript in this run.

1. `tools/list`

- Status: Blocked
- Evidence: Interactive Antigravity session required for MCP tool transcript capture.

1. `tools/call ping`

- Status: Blocked
- Evidence: Interactive Antigravity session required for MCP tool transcript capture.

1. `tools/call list_tables`

- Status: Blocked
- Evidence: Interactive Antigravity session required for MCP tool transcript capture.

1. `tools/call execute_query` mutation rejection

- Status: Blocked
- Evidence: Interactive Antigravity session required for MCP tool transcript capture.

## Outcome

- Final status: Blocked
- Notes: `antigravity --help` and `antigravity chat --help` succeeded; command supports MCP registration (`--add-mcp`), but this terminal flow did not provide complete non-interactive smoke evidence capture.
- Follow-up actions: Run smoke directly in Antigravity chat using workspace MCP profile and record outputs here.
