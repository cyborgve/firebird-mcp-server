# Smoke Test Matrix

This document defines the reproducible smoke test process for all supported editor clients.

## Execution Progress Snapshot

- Last update: `2026-03-09`.
- Automated baseline checks: completed (`pnpm run build`, `pnpm run test` = `13` files / `205` tests, `pnpm run smoke:stdio`).
- MCP protocol regression checks: covered in automated suite (`initialize`, lifecycle order, `tools/list`, `tools/call`, cancellation).
- Advanced Firebird tool coverage: automated tests include `explain_query_plan`, `list_indexes`, `list_constraints`, and `database_overview`.
- Manual editor evidence collection: completed for current environment with explicit per-editor status (`Blocked` where interactive/manual verification is required).

## Preconditions

- `pnpm install`
- `pnpm run build`
- Firebird instance reachable with valid credentials
- Environment variables set for the MCP server process

## Shared Protocol Checks

Every editor integration must pass the following sequence:

1. Start or reload the editor MCP client.
2. Confirm `initialize` succeeds.
3. Confirm `tools/list` returns all expected tools.
4. Confirm `tools/call` with `ping` succeeds.
5. Confirm `tools/call` with `list_tables` succeeds.
6. Confirm `tools/call` with `execute_query` rejects non-read-only SQL.

## Automated Stdio Smoke

Run this baseline check before manual editor validations:

```bash
pnpm run build
pnpm run smoke:stdio
```

To persist a machine-readable artifact:

```bash
pnpm run smoke:stdio:evidence
```

Editor evidence templates and per-editor records are available at:

- `docs/integrations/evidence/README.md`
- `docs/integrations/evidence/editor-smoke-template.md`
- `docs/integrations/evidence/UNBLOCK-PLAYBOOK.md`

Expected automated scope:

- `initialize`
- `notifications/initialized`
- `tools/list` including required tools
- `tools/call ping`
- `tools/call list_tables`
- `tools/call execute_query` mutation guard rejection

Expected tools:

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

## Editor Matrix

| Editor             | Config Guide            | Template                                | Status  | Notes                                                                                                       |
| ------------------ | ----------------------- | --------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| VS Code Copilot    | `vscode-copilot.md`     | `templates/vscode-copilot.mcp.json`     | Blocked | Interactive Copilot UI validation required. See `evidence/vscode-copilot-smoke.md`.                         |
| Copilot CLI        | `copilot-cli.md`        | `templates/copilot-cli.mcp.json`        | Blocked | `gh copilot` unavailable in current environment. See `evidence/copilot-cli-smoke.md`.                       |
| Cursor             | `cursor.md`             | `templates/cursor.mcp.json`             | Blocked | Cursor UI/CLI unavailable in current terminal session. See `evidence/cursor-smoke.md`.                      |
| Cline              | `cline.md`              | `templates/cline.mcp.json`              | Blocked | `cline` CLI unavailable and smoke requires interactive UI. See `evidence/cline-smoke.md`.                   |
| Gemini CLI         | `gemini-cli.md`         | `templates/gemini-cli.mcp.json`         | Blocked | `gemini` CLI unavailable in current environment. See `evidence/gemini-cli-smoke.md`.                        |
| Gemini Code Assist | `gemini-code-assist.md` | `templates/gemini-code-assist.mcp.json` | Blocked | Interactive agent mode unavailable in current terminal session. See `evidence/gemini-code-assist-smoke.md`. |
| Claude Desktop     | `claude-desktop.md`     | `templates/claude-desktop.mcp.json`     | Blocked | `claude` command unavailable and checks require interactive app. See `evidence/claude-desktop-smoke.md`.    |
| Claude Code        | `claude-code.md`        | `templates/claude-code.mcp.json`        | Blocked | `claude` CLI unavailable in current environment. See `evidence/claude-code-smoke.md`.                       |
| Windsurf           | `windsurf.md`           | `templates/windsurf.mcp.json`           | Blocked | `windsurf` CLI unavailable and smoke requires interactive app. See `evidence/windsurf-smoke.md`.            |
| Antigravity        | `antigravity.md`        | `templates/antigravity.mcp.json`        | Blocked | CLI available, but interactive chat evidence capture still required. See `evidence/antigravity-smoke.md`.   |

## Evidence Collection

For each editor, capture:

- `initialize` success confirmation.
- `tools/list` output with all expected tools.
- `ping` response payload.
- `list_tables` response payload.
- Rejected non-read-only SQL response from `execute_query`.

Store evidence in your PR description or linked QA artifact.
