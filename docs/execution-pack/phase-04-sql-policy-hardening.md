# Phase 04: SQL Policy Hardening

## Objective

Strengthen `execute_query` policy using parser-backed or hybrid validation while preserving safe default behavior.

## Inputs

- `src/mcp/tools/execute-query.ts`
- `src/mcp/tools/sql-validator.ts`
- `src/mcp/tools/sql-validator.test.ts`
- `docs/security-and-limits.md`

## Execution Steps

1. Introduce parser-backed inspection path or hybrid guardrail model.
2. Preserve existing defenses:
   - read-only default mode
   - mutation/multi-statement rejection
   - identifier allowlist controls
3. Add targeted negative tests for bypass attempts.
4. Add audit-mode diagnostics (optional) before strict enforcement if behavior risk is high.
5. Update threat notes in docs.

## Quality Gates

- Existing valid read-only queries still pass.
- Bypass regression tests pass.
- No increase in internal error rate due to parser path.

## Deliverables

- Hardened SQL policy implementation.
- Expanded security regression tests.

## Definition Of Done

- [ ] Hardened policy merged with tests.
- [ ] Security docs updated.
- [ ] Backward compatibility validated.
