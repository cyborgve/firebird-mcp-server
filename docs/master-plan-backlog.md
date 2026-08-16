# Master Plan Backlog

This document is the execution backlog for the unified improvement plan.
It intentionally uses priority and dependencies instead of fixed calendar dates.

## Goals

- Harden MCP lifecycle, security, and SQL execution controls.
- Improve editor integrations and onboarding quality.
- Expand Firebird capabilities while preserving existing contracts.

## Supported Editor Targets

- VS Code (Copilot)
- Cursor
- Cline
- Claude Desktop
- Claude Code
- Windsurf

## Working Agreement

- Keep backward compatibility for existing MCP clients unless a breaking change is explicitly approved.
- Prefer additive changes and feature flags for risky behavior.
- All new behavior must include tests and documentation updates.
- Secrets must never be logged or hardcoded.

## Epic 1: Platform Baseline And Governance [COMPLETED]

### Issue 1.1: Define baseline metrics and acceptance dashboard

- Type: setup
- Priority: P0
- Dependencies: none
- Scope:
  - Define baseline signals for startup, handshake success, tool call success, and error rates.
  - Record baseline in docs as reference values.
- Acceptance Criteria:
  - Baseline section exists in documentation.
  - Signals are measurable with repeatable local commands.
- Definition of Done:
  - Documentation merged.
  - Verification checklist committed.

### Issue 1.2: MCP compatibility checklist

- Type: governance
- Priority: P0
- Dependencies: 1.1
- Scope:
  - Create a repository checklist for lifecycle, method support, error semantics, and protocol version behavior.
- Acceptance Criteria:
  - Checklist covers `initialize`, `notifications/initialized`, `tools/list`, `tools/call`, cancellation, and invalid requests.
- Definition of Done:
  - Checklist referenced from contributor docs.

## Epic 2: MCP Contract Hardening

### Issue 2.1: Add tool annotations and metadata support

- Type: feature
- Priority: P0
- Dependencies: 1.2
- Scope:
  - Extend tool definitions to expose MCP annotations and optional metadata.
  - Emit read-only hints for read-only tools.
- Acceptance Criteria:
  - `tools/list` returns annotations for applicable tools.
  - Existing clients still parse responses without failure.
- Definition of Done:
  - Unit tests for serialized tool manifests.
  - Documentation updated with response examples.

### Issue 2.2: Error model consistency improvements

- Type: reliability
- Priority: P0
- Dependencies: 2.1
- Scope:
  - Normalize mapping of runtime errors to JSON-RPC error codes.
- Acceptance Criteria:
  - Invalid params, unknown methods, timeout, and internal errors map consistently.
- Definition of Done:
  - Test cases for each error category.

### Issue 2.3: Handshake and cancellation regression tests

- Type: test
- Priority: P0
- Dependencies: 2.2
- Scope:
  - Expand MCP tests for lifecycle ordering and cancellation behavior.
- Acceptance Criteria:
  - Requests before initialization are rejected as expected.
  - In-flight cancellation path is covered.
- Definition of Done:
  - CI test suite passes with new cases.

## Epic 3: SQL Security And Execution Policy

### Issue 3.1: Introduce parser-backed SQL policy engine

- Type: security
- Priority: P0
- Dependencies: 2.3
- Scope:
  - Replace purely lexical checks with parser-backed validation or hybrid policy.
- Acceptance Criteria:
  - Policy blocks mutating statements and multi-statement payloads reliably.
- Definition of Done:
  - Security tests include bypass attempts and edge cases.

### Issue 3.2: Split safe and ad-hoc SQL modes

- Type: security
- Priority: P0
- Dependencies: 3.1
- Scope:
  - Add a pre-defined safe query mode and keep ad-hoc mode behind explicit opt-in.
- Acceptance Criteria:
  - Safe mode is default.
  - Ad-hoc mode requires explicit configuration flag.
- Definition of Done:
  - Docs clearly explain risk profile and defaults.

### Issue 3.3: Strengthen template parameter controls

- Type: security
- Priority: P1
- Dependencies: 3.1
- Scope:
  - Add allowlists for dynamic identifiers and strict parameter validation.
- Acceptance Criteria:
  - Unsafe identifier substitution attempts are rejected.
- Definition of Done:
  - Negative tests and threat-model notes added.

## Epic 4: Declarative Configuration And Toolsets

### Issue 4.1: Introduce external tool configuration file

- Type: feature
- Priority: P1
- Dependencies: 2.3
- Scope:
  - Add optional `tools.yaml` or `tools.json` loading path.
- Acceptance Criteria:
  - Server boots with file-based config and existing static config fallback.
- Definition of Done:
  - Config schema docs and examples committed.

### Issue 4.2: Toolsets support

- Type: feature
- Priority: P1
- Dependencies: 4.1
- Scope:
  - Group tools by named profiles (e.g., `readonly`, `schema`, `ops`).
- Acceptance Criteria:
  - Toolset selection limits visible tool list and callable tools.
- Definition of Done:
  - Integration tests for toolset filtering.

### Issue 4.3: Controlled reload behavior

- Type: reliability
- Priority: P2
- Dependencies: 4.1
- Scope:
  - Add safe reload path and disable-reload option.
- Acceptance Criteria:
  - Reload updates tool catalog without process restart when enabled.
- Definition of Done:
  - Reload tests and operator documentation included.

## Epic 5: Multi-Editor Integration

### Issue 5.1: Official config templates for all target editors

- Type: feature
- Priority: P0
- Dependencies: 2.3
- Scope:
  - Create tested MCP config templates for all supported editors.
- Acceptance Criteria:
  - Templates exist for each editor in the target list.
  - Each template includes env variables and start command guidance.
- Definition of Done:
  - Files committed under `docs/integrations/` with validated examples.

### Issue 5.2: Editor-specific setup guides

- Type: documentation
- Priority: P0
- Dependencies: 5.1
- Scope:
  - Add per-editor setup and verification guide pages.
- Acceptance Criteria:
  - Guides include install, config location, sample config, and quick validation prompts.
- Definition of Done:
  - Links added to docs index and main README.

### Issue 5.3: Smoke test matrix for editor compatibility

- Type: test
- Priority: P0
- Dependencies: 5.1
- Scope:
  - Define and automate a smoke checklist for each editor.
- Acceptance Criteria:
  - Matrix verifies `initialize`, `tools/list`, and basic `tools/call` on each editor profile.
- Definition of Done:
  - Reproducible test procedure documented.

### Issue 5.4: Troubleshooting playbooks for editors

- Type: operations
- Priority: P1
- Dependencies: 5.2
- Scope:
  - Common failure modes, diagnostics, and fixes per editor.
- Acceptance Criteria:
  - Includes path issues, env issues, startup issues, and protocol mismatch cases.
- Definition of Done:
  - Playbooks available and cross-linked.

## Epic 6: VS Code Extension Reliability

### Issue 6.1: Activation and auto-start reliability

- Type: reliability
- Priority: P0
- Dependencies: 2.3
- Scope:
  - Ensure extension can auto-start without manual command invocation.
- Acceptance Criteria:
  - Auto-start setting works on editor launch and workspace reload.
- Definition of Done:
  - Extension tests or verified manual checklist included.

### Issue 6.2: Robust server path and process spawn handling

- Type: reliability
- Priority: P0
- Dependencies: 6.1
- Scope:
  - Resolve server path from extension context rather than process working directory.
- Acceptance Criteria:
  - Start works from packaged extension and varied workspace layouts.
- Definition of Done:
  - Error messages include actionable diagnostics.

### Issue 6.3: Apply all extension settings at runtime

- Type: feature
- Priority: P1
- Dependencies: 6.2
- Scope:
  - Ensure configured options are propagated to MCP process env/args.
- Acceptance Criteria:
  - `readOnly`, `logLevel`, and tool selection settings are effective.
- Definition of Done:
  - Regression tests or verification scripts updated.

### Issue 6.4: Connection test command and status UX

- Type: UX
- Priority: P1
- Dependencies: 6.2
- Scope:
  - Add explicit command to test MCP handshake and tool listing.
  - Add status indicator (`Starting`, `Ready`, `Error`).
- Acceptance Criteria:
  - User can diagnose connection state without reading raw logs.
- Definition of Done:
  - Command and status behavior documented.

## Epic 7: Observability And Operations

### Issue 7.1: OpenTelemetry tracing and metrics

- Type: observability
- Priority: P1
- Dependencies: 2.3
- Scope:
  - Instrument key server and tool execution paths.
- Acceptance Criteria:
  - Metrics and spans emitted for lifecycle and tool calls.
- Definition of Done:
  - Export configuration documented.

### Issue 7.2: Editor/client dimension in telemetry

- Type: observability
- Priority: P1
- Dependencies: 7.1, 5.1
- Scope:
  - Tag telemetry by editor/client profile (including Copilot CLI and Antigravity).
- Acceptance Criteria:
  - Dashboard can segment errors and latency by client type.
- Definition of Done:
  - Sample dashboard/query examples documented.

### Issue 7.3: MCP Inspector diagnostics workflow

- Type: operations
- Priority: P2
- Dependencies: 7.1
- Scope:
  - Provide an official inspector workflow for debugging transport and method issues.
- Acceptance Criteria:
  - Playbook includes command, expected outputs, and failure interpretation.
- Definition of Done:
  - Linked from troubleshooting docs.

## Epic 8: Firebird Capability Expansion

### Issue 8.1: Add advanced read-only tools

- Type: feature
- Priority: P2
- Dependencies: 3.1
- Scope:
  - Implement `explain_query_plan`, `list_indexes`, `list_constraints`, `database_overview`.
- Acceptance Criteria:
  - Tools are discoverable and return validated structured outputs.
- Definition of Done:
  - Unit and integration tests for each tool.

### Issue 8.2: Structured tool output support

- Type: feature
- Priority: P2
- Dependencies: 2.1
- Scope:
  - Add optional `structuredContent` responses while keeping text content compatibility.
- Acceptance Criteria:
  - Clients can consume structured payloads without parsing `content[0].text`.
- Definition of Done:
  - Backward-compatible response tests included.

## Cross-Cutting Quality Gates

- Security gate:
  - No secret exposure in logs, docs, or test fixtures.
- Compatibility gate:
  - Existing MCP workflows continue to function unless explicitly versioned.
- Testing gate:
  - New functionality requires unit tests and relevant integration tests.
- Documentation gate:
  - Every user-facing behavior change includes docs updates.

## Execution Order Recommendation

1. Epic 1
2. Epic 2
3. Epic 3
4. Epic 5
5. Epic 6
6. Epic 4
7. Epic 7
8. Epic 8

## Final Exit Criteria

- MCP contract is stable, well-tested, and editor-compatible.
- SQL execution model is secure by default.
- All supported editors have validated setup guides and smoke coverage.
- Operational observability is sufficient for production diagnostics.
- Expanded Firebird capabilities are documented and tested.
