# AI Execution Pack

This pack provides a deterministic, model-agnostic workflow to execute repository improvements in controlled phases.

All artifacts are designed to be used by any AI model or human operator with minimal interpretation overhead.

## Scope

- Improve protocol hardening, security, transport, observability, and operational quality.
- Preserve backward compatibility unless a phase explicitly declares a controlled break.
- Keep implementation and docs aligned with repository standards and MCP lifecycle guarantees.

## How To Use This Pack

1. Start with `phase-01-baseline-governance.md`.
2. Execute one phase at a time.
3. Do not start the next phase until all current phase gates are green.
4. Keep evidence updated under `docs/integrations/evidence/`.
5. Update `docs/PLAN-EXECUTION-STATUS.md` after each completed phase.

## Required Global Rules

- Never print or persist secrets.
- Keep MCP lifecycle strict: `initialize` then `notifications/initialized`.
- Keep protocol output in `stdout` and logs in `stderr`.
- Add tests and documentation in the same change whenever behavior changes.

## Phase Runbooks

- [Phase 01: Baseline and Governance](phase-01-baseline-governance.md)
- [Phase 02: MCP Compatibility and Versioning](phase-02-mcp-compatibility-versioning.md)
- [Phase 03: Streamable HTTP Secure Transport](phase-03-streamable-http-secure-transport.md)
- [Phase 04: SQL Policy Hardening](phase-04-sql-policy-hardening.md)
- [Phase 05: Auth and Secrets Hardening](phase-05-auth-secrets-hardening.md)
- [Phase 06: Observability Upgrade](phase-06-observability-upgrade.md)
- [Phase 07: Multi-Editor Quality and Release Governance](phase-07-multieditor-quality-release-governance.md)

## Operator Templates

- [Model Prompt Template](templates/model-prompt-template.md)
- [Execution Report Template](templates/execution-report-template.md)

## Stop Conditions

Stop execution and request manual approval if any of the following occurs:

- Potential secret leakage in logs, docs, or config snapshots.
- Breaking protocol behavior for existing `stdio` clients.
- Security-critical regressions in SQL policy or auth checks.
- Inability to pass build and tests after two focused remediation attempts.
