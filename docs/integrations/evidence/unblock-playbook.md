# Smoke Unblock Playbook

This playbook defines the minimum actions required to move an editor/client smoke record from `Blocked` to `Validated`.

## Standard Exit Criteria

Mark an editor as `Validated` only when all checks are captured in its evidence file:

1. `initialize` success
2. `tools/list` with expected tools
3. `tools/call ping` success
4. `tools/call list_tables` success
5. `tools/call execute_query` mutation rejection

Also include:

- date/time
- operator
- environment details
- relevant config path

## Shared Preparation

Run this before any interactive validation:

```bash
pnpm run build
pnpm run smoke:stdio:evidence
```

Reference artifact:

- `docs/integrations/evidence/stdio-smoke-latest.json`

## Client-Specific Unblock Actions

### VS Code Copilot

1. Open workspace in VS Code and ensure `.vscode/mcp.json` is loaded.
2. Open Copilot Chat in agent mode and confirm server availability.
3. Run prompts that force `ping`, `list_tables`, and a mutation attempt via `execute_query`.
4. Update `docs/integrations/evidence/vscode-copilot-smoke.md`.

### Copilot CLI

1. Install/enable Copilot CLI support for `gh` (or the current supported CLI path).
2. Verify command availability with `gh copilot --help`.
3. Execute smoke calls and capture outputs.
4. Update `docs/integrations/evidence/copilot-cli-smoke.md`.

### Cursor / Cline / Windsurf

1. Open the client UI and load workspace MCP config.
2. Confirm MCP server appears connected.
3. Execute smoke prompts (`ping`, `list_tables`, mutation rejection).
4. Update the corresponding evidence file.

### Gemini CLI / Gemini Code Assist

1. Ensure Gemini CLI/agent mode is installed and authenticated.
2. Load workspace MCP configuration.
3. Execute smoke prompts and capture outputs.
4. Update corresponding evidence files.

### Claude Desktop / Claude Code

1. Ensure Claude app/CLI is installed and configured with MCP settings.
2. Restart session to reload MCP server registration.
3. Execute smoke prompts and capture outputs.
4. Update corresponding evidence files.

### Antigravity

1. Configure MCP server in the active Antigravity profile.
2. Run smoke prompts from an interactive chat session.
3. Capture outputs into `docs/integrations/evidence/antigravity-smoke.md`.

## Completion Update

After validating a client:

1. Change its evidence `Final status` to `Validated`.
2. Update the same editor row in `docs/integrations/smoke-test-matrix.md` from `Blocked` to `Validated`.
3. Add a short note pointing to evidence details.
