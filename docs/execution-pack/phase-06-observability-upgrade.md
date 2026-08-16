# Phase 06: Observability Upgrade

## Objective

Upgrade telemetry from minimal counters to operationally useful traces and metrics while keeping lightweight defaults.

## Inputs

- `src/observability/telemetry.ts`
- `src/mcp/mcp-server.ts`
- `docs/observability-and-testing.md`

## Execution Steps

1. Define telemetry target model:
   - lifecycle metrics
   - tool execution latency/error dimensions
   - client/editor segmentation
2. Implement OTel-compatible emission path (or adapter) behind config.
3. Keep current lightweight logging exporter for local usage.
4. Add tests for telemetry emission shape and bounds.
5. Document sample queries and dashboard recommendations.

## Quality Gates

- No performance regression for default local profile.
- Emitted telemetry includes stable dimensions.
- Telemetry behavior is deterministic under disabled/enabled modes.

## Deliverables

- Enhanced observability implementation.
- Updated observability guide with operator queries.

## Definition Of Done

- [ ] Telemetry upgrade merged.
- [ ] Tests for observability path pass.
- [ ] Docs include practical dashboard/query examples.
