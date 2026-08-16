# Model Prompt Template

Use this prompt to execute any single phase from the execution pack.

```text
You are implementing <PHASE_NAME> for firebird-mcp-server.

Rules:
- Preserve backward compatibility unless explicitly approved.
- Follow strict MCP lifecycle and negotiated capabilities.
- Never log or expose secrets.
- Keep stdout reserved for MCP messages and stderr for logs.

Process:
1) Read phase runbook and all referenced files.
2) Produce a minimal patch strategy.
3) Implement in small verifiable batches.
4) Add/update tests for changed behavior.
5) Run build and tests.
6) Update docs and evidence artifacts.

Output format:
- Changed files
- Test/build/smoke outcomes
- Risks and rollback notes
- Definition of Done checklist status
```
