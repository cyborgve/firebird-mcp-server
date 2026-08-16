# Editor Smoke Evidence

This folder stores smoke validation evidence per editor/client profile.

## How To Use

1. Run automated baseline:

```bash
pnpm run build
pnpm run smoke:stdio:evidence
```

1. For each editor, copy `editor-smoke-template.md` into a dedicated file.
2. Fill all sections with concrete outputs and timestamps.
3. Update `docs/integrations/smoke-test-matrix.md` status and notes.

## Suggested File Names

- `vscode-copilot-smoke.md`
- `copilot-cli-smoke.md`
- `cursor-smoke.md`
- `cline-smoke.md`
- `gemini-cli-smoke.md`
- `gemini-code-assist-smoke.md`
- `claude-desktop-smoke.md`
- `claude-code-smoke.md`
- `windsurf-smoke.md`
- `antigravity-smoke.md`

## Unblock Guidance

- `UNBLOCK-PLAYBOOK.md`
