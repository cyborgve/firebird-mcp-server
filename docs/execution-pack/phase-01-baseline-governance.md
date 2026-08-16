# Phase 01: Baseline and Governance

## Objective

Establish a reproducible technical baseline and governance checkpoints before any architectural or behavioral change.

## Inputs

- `docs/BASELINE-AND-ACCEPTANCE.md`
- `docs/MCP-COMPATIBILITY-CHECKLIST.md`
- `docs/MASTER-PLAN-BACKLOG.md`
- `docs/PLAN-EXECUTION-STATUS.md`

## Preconditions

- Dependencies installed.
- Local environment can run build and tests.

## Execution Steps

1. Run baseline validation commands.

```bash
pnpm run build
pnpm run test
pnpm run smoke:stdio
```

1. Capture command outcomes and key metrics in a dated execution report.
2. Confirm MCP checklist coverage against current tests.
3. Identify pre-existing failures and classify them as:
   - out of scope baseline debt
   - blocker for next phase
4. Update `docs/PLAN-EXECUTION-STATUS.md` with current validated baseline snapshot.

## Quality Gates

- Build passes.
- Test suite passes.
- Smoke check passes.
- No unresolved critical blocker for Phase 02.

## Deliverables

- Updated baseline evidence in `docs/integrations/evidence/`.
- Updated plan status snapshot.

## Rollback

If baseline cannot be stabilized, revert only phase-specific documentation edits and keep investigation notes in a separate evidence file.

## Definition Of Done

- [ ] Baseline commands are green.
- [ ] Evidence captured and linked.
- [ ] Plan status updated with objective pass/fail state.
