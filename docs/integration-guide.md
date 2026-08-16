# Integration Guide

## Protocol and Transport

- Protocol: JSON-RPC 2.0
- MCP pattern: `initialize` -> `notifications/initialized` -> tool operations
- Transport: `stdio` only

## Session Flow

1. Start server process (`node dist/server.js`).
2. Send `initialize` request.
3. Send `notifications/initialized` notification.
4. Call `tools/list` and `tools/call`.

## Minimal Request Sequence

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
```

## Calling a Tool

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "list_tables",
    "arguments": {}
  }
}
```

Tool results are returned as MCP content blocks; JSON payload is usually inside `result.content[0].text`.

## Error Handling

Common JSON-RPC/MCP errors:

- `-32002`: Server not initialized
- `-32600`: Invalid request envelope
- `-32601`: Method or tool not found
- `-32602`: Invalid params
- `-32603`: Internal error

## Client Implementation Tips

- Keep one JSON object per line in `stdio` mode.
- Parse `stderr` as logs only; do not treat it as protocol output.
- Handle timeout and cancellation scenarios in your client logic.
