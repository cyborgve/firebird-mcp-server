# Phase 04 SQL Policy Hardening Report (2026-03-09)

## Metadata

- Phase: 04 - SQL Policy Hardening
- Date: 2026-03-09
- Operator (AI model or human): GitHub Copilot (GPT-5.3-Codex)
- Branch: `main`
- Commit range: `2fa1b60` (workspace snapshot at execution time)

## Scope Executed

- Planned items:
  - Validate parser-backed or hybrid SQL policy hardening.
  - Preserve existing safe-mode controls and anti-mutation defenses.
  - Add targeted bypass-regression tests.
  - Update threat notes in docs.
- Completed items:
  - Confirmed parser-backed/hybrid SQL validator path remains active in `execute_query` safe mode.
  - Preserved existing controls: read-only default, mutation rejection, multi-statement rejection, identifier allowlist controls.
  - Added bypass-regression tests for whitespace-obfuscated keyword-pair attacks.
  - Updated security docs with explicit obfuscation guardrail notes.
- Deferred items:
  - Optional audit-mode diagnostics were not required for this phase based on low behavior-risk profile and existing deterministic enforcement.

## Files Changed

- `src/mcp/tools/sql-validator.test.ts`: added targeted negative tests for newline/whitespace obfuscation bypass attempts.
- `docs/security-and-limits.md`: added SQL obfuscation guardrail notes (`EXECUTE STATEMENT`, `SET TERM`, comments).

## Validation

- Focused tests:
  - `pnpm run test -- src/mcp/tools/sql-validator.test.ts` -> `PASS` (`46` tests)
- Build command and result:
  - `pnpm run build` -> `PASS`
- Full test command and result:
  - `pnpm run test` -> `PASS` (`13` files, `201` tests)
- Smoke command and result:
  - `pnpm run smoke:stdio` -> `PASS`

## Behavior Impact

- Backward compatibility status:
  - Preserved. Existing valid read-only queries continue to pass.
- Security impact:
  - Positive. Added explicit regression coverage for whitespace-obfuscated blocked keyword pairs.
- Performance impact:
  - None expected. Changes are test/documentation-level.

## Risks and Mitigations

- Risk 1:
  - Future Firebird syntax extensions may require validator/token updates.
  - Mitigation: preserve focused regression suite and expand with each parser policy change.
- Risk 2:
  - Overly strict policy can block edge-case but valid read-only queries.
  - Mitigation: keep safe-mode validation deterministic and add compatibility tests before tightening rules.

## Rollback Plan

- Revert strategy:
  - Revert SQL validator test additions and security-doc updates.
- Data/contract recovery notes:
  - No runtime contract changes or data migration in this phase.

## Definition Of Done

- [x] Hardened policy merged with tests.
- [x] Security docs updated.
- [x] Backward compatibility validated.
