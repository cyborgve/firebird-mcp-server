# Baseline And Acceptance

This document defines the baseline signals and acceptance checks used to execute the master plan rigorously.

## Baseline Signals

Track these signals before and after each relevant change set:

- `startup.success_rate`
  : Percentage of successful server starts.
- `mcp.initialize.success_rate`
  : Percentage of successful `initialize` responses.
- `mcp.tools_list.success_rate`
  : Percentage of successful `tools/list` responses.
- `mcp.tools_call.success_rate`
  : Percentage of successful `tools/call` responses.
- `mcp.tools_call.error_rate`
  : Percentage of `tools/call` responses with JSON-RPC errors.
- `extension.start.success_rate`
  : Percentage of successful starts through VS Code extension.

## Local Verification Commands

Use these commands as the baseline validation workflow:

```bash
pnpm run build
pnpm run test
```

For MCP contract checks, run tests focused on MCP and tool registry modules:

```bash
pnpm run test -- src/mcp/mcp-server.test.ts src/mcp/tools/tool-registry.test.ts
```

## Acceptance Thresholds

- No regression in MCP lifecycle behavior (`initialize` -> `notifications/initialized`).
- No regression in `tools/list` and `tools/call` success tests.
- No increase in read-only policy bypass test failures.
- New capabilities must include tests and docs.

## Change Control Checklist

Before marking any issue complete:

- Code changes implemented and reviewed.
- Tests added/updated and passing.
- Docs updated with user-visible behavior.
- Security-sensitive behavior reviewed (secrets, SQL policy, auth flow).
