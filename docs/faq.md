# FAQ

## Why do I get `Server not initialized`?

You must call `initialize` first, then send `notifications/initialized`, before using tools.

## Why is a query rejected?

`execute_query` only allows read-only SQL. Mutating statements are blocked by policy.

## Where is tool data in responses?

For tool calls, parse `result.content[0].text` as JSON.

## Why are results truncated?

Row/table/schema results are bounded by runtime limits from environment variables.

## Why are logs not visible in protocol output?

Logs are intentionally written to `stderr`; `stdout` is reserved for JSON-RPC messages.

## Which methods should I call for tools?

Use MCP methods:

- `tools/list`
- `tools/call`

Do not call tool names directly as JSON-RPC methods.
