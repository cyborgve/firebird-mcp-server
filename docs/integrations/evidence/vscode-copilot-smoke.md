# VS Code Copilot Smoke Validation

- Date: 2026-03-08
- Operator: AI agent (terminal session)
- Environment: Windows, terminal-only automation session
- Config File Path: `.vscode/mcp.json`
- Config Snippet Reference: `docs/integrations/templates/vscode-copilot.mcp.json`

## Baseline Artifact

- Stdio baseline JSON: `docs/integrations/evidence/stdio-smoke-latest.json`

## Manual Validation Results

1. `initialize`

- Status: Blocked
- Evidence: Requires interactive Copilot Chat MCP session in VS Code UI; terminal automation cannot invoke Copilot agent tool calls directly.

1. `tools/list`

- Status: Blocked
- Evidence: Same blocker as above (interactive UI path required).

1. `tools/call ping`

- Status: Blocked
- Evidence: Same blocker as above (interactive UI path required).

1. `tools/call list_tables`

- Status: Blocked
- Evidence: Same blocker as above (interactive UI path required).

1. `tools/call execute_query` mutation rejection

- Status: Blocked
- Evidence: Same blocker as above (interactive UI path required).

## Outcome

- Final status: Blocked
- Notes: VS Code CLI is installed (`C:\Users\Richard Iribarren\AppData\Local\Programs\Microsoft VS Code\Code.exe`), but this does not provide a non-interactive API to execute Copilot Chat MCP smoke calls.
- Follow-up actions: Run the same checks manually in VS Code Copilot Chat (agent mode) and record outputs in this file.
