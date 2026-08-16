# Phase 02: MCP Compatibility and Versioning

## Objective

Harden protocol compatibility and lifecycle correctness while preserving current client behavior.

## Inputs

- `src/mcp/mcp-server.ts`
- `src/mcp/json-rpc-types.ts`
- `src/mcp/mcp-server.test.ts`
- `docs/MCP-COMPATIBILITY-CHECKLIST.md`

## Execution Steps

1. Define explicit protocol compatibility policy:
   - supported versions
   - fallback behavior
   - error semantics for unsupported versions
2. Enforce strict capability negotiation at initialization boundaries.
3. Add or update tests for:
   - unsupported protocol version
   - lifecycle ordering errors
   - capability-gated method behavior
4. Keep current clients working by default.

## Quality Gates

- All MCP lifecycle tests pass.
- Unsupported version behavior is deterministic and documented.
- No regression in `tools/list` or `tools/call`.

## Deliverables

- Updated protocol behavior tests.
- Documentation update in compatibility/checklist files.

## Definition Of Done

- [ ] Compatibility policy implemented.
- [ ] Regression tests green.
- [ ] Documentation aligned with runtime behavior.
