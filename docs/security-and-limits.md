# Security and Limits

## Security Model

This server is designed for read-focused database access from MCP clients.

Key controls:

- Input validation with Zod schemas
- SQL read-only enforcement for `execute_query`
- Parameter count limits
- Result size limits
- Tool execution timeout
- Structured logs without protocol contamination
- Optional HTTP transport origin allowlist validation
- Optional bearer token authentication for HTTP transport
- MCP protocol version header enforcement for HTTP non-initialize calls

## HTTP Transport Security Controls

When `MCP_TRANSPORT=http`:

- Requests are accepted only on configured `MCP_HTTP_PATH` and only via `POST`.
- If `MCP_HTTP_ALLOWED_ORIGINS` is set, only exact listed origins are accepted.
- If allowlist is not set, only loopback browser origins are accepted by default.
- For non-local bind addresses, authentication is mandatory and startup fails without `MCP_HTTP_AUTH_TOKEN`.
- For protected endpoints, clients must send `Authorization: Bearer <token>`.
- Non-initialize JSON-RPC requests must send `MCP-Protocol-Version` when enforcement is enabled.

## Template Identifier Controls

`execute_query` supports optional `{{identifier}}` placeholders for controlled dynamic SQL.

Security constraints:

- Every placeholder must have a corresponding `identifiers` binding.
- Bound identifier values must match strict identifier syntax.
- Bound identifier values must exist in `MCP_EXECUTE_QUERY_ALLOWED_IDENTIFIERS`.
- Any unresolved or malformed template syntax is rejected.

Threat model notes:

- Prevents identifier-level SQL injection through table/column substitution.
- Prevents accidental access to non-approved tables or schema-qualified objects.
- Keeps dynamic SQL flexibility constrained to a reviewed allowlist.

## Parameter Validation Controls

`params` accepts only scalar JSON-safe values:

- `string` (max length: 4000)
- `number` (finite only)
- `boolean`
- `null`

Nested objects/arrays are rejected to reduce injection and serialization ambiguity risks.

## SQL Policy

`execute_query` runs in `safe` mode by default and accepts only read-only SQL.

`ad-hoc` mode is available only through explicit `MCP_EXECUTE_QUERY_MODE=ad-hoc` opt-in.

Blocked by policy:

- DML/DDL operations (for example `INSERT`, `UPDATE`, `DELETE`, `DROP`)
- Multi-statement payloads
- Unsafe patterns detected by SQL validator

Additional obfuscation guardrails:

- SQL comments (`--`, `/* ... */`) are rejected.
- Keyword-pair payloads such as `EXECUTE STATEMENT` and `SET TERM` are rejected even when split with extra whitespace.

## Runtime Limits

Limits are configured via environment variables and enforced server-side:

- Timeout per tool
- Maximum number of listed tables
- Maximum schema breadth (tables/columns)
- Maximum returned rows
- Maximum input parameters

## Operational Recommendations

- Use a dedicated read-only DB account.
- Run server in a controlled environment.
- Monitor `stderr` logs for validation and runtime errors.
- Keep dependencies and runtime patched.

## Secrets and Auth Hardening Notes

- Structured logs redact sensitive context keys (for example password/token/authorization/secret fields).
- HTTP auth failures are deterministic (`401 Unauthorized`) and do not leak token values.
- Keep bearer tokens out of command history and application traces.
