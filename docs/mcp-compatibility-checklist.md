# MCP Compatibility Checklist

Use this checklist to validate MCP protocol compliance after each core change.

## Lifecycle

- [ ] `initialize` request is accepted with valid params.
- [ ] `initialize` returns negotiated protocol version and capabilities.
- [ ] `notifications/initialized` transitions server to ready state.
- [ ] Requests before initialization return `-32002`.
- [ ] Duplicate `initialize` requests after handshake return `-32602`.

## Protocol Version Policy

- [ ] Supported versions are explicitly documented and enforced.
- [ ] Unsupported protocol versions return `-32602` with deterministic message.

## Core Methods

- [ ] `tools/list` returns a valid tools array.
- [ ] `tools/list` pagination behaves correctly (`nextCursor` when needed).
- [ ] `tools/call` resolves known tools and rejects unknown tools with `-32601`.
- [ ] `tools/call` validates params and returns `-32602` on invalid input.

## Tool Metadata And Annotations

- [ ] `tools/list` includes tool `name`, `description`, and `inputSchema`.
- [ ] `tools/list` includes tool `annotations` where defined.
- [ ] Read-only tools expose `readOnlyHint: true`.

## Error Semantics

- [ ] Invalid request envelope returns `-32600`.
- [ ] Unknown method returns `-32601`.
- [ ] Invalid params returns `-32602`.
- [ ] Internal failures return `-32603`.

## Cancellation

- [ ] `notifications/cancelled` is handled without crashing.
- [ ] Unknown cancellation request IDs are ignored safely.

## Read-Only SQL Policy

- [ ] Mutating SQL is rejected by policy.
- [ ] Multi-statement payloads are rejected.
- [ ] SQL comments used for obfuscation are rejected.

## Transport Guarantees

- [ ] Protocol output only on `stdout`.
- [ ] Logs only on `stderr`.
- [ ] HTTP mode rejects invalid origins.
- [ ] HTTP protected mode rejects missing/invalid bearer token.
- [ ] HTTP mode enforces `MCP-Protocol-Version` header for non-initialize calls.

## Capability Negotiation

- [ ] Client capability negotiation is captured during `initialize`.
- [ ] Capability-gated behavior is deterministic (for example `tools/reload` requires `capabilities.tools.listChanged !== false`).
