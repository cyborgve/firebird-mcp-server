# Usage Examples

Examples below use JSON-RPC 2.0 over `stdio`.

## Ping

Request:

```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "method": "tools/call",
  "params": {
    "name": "ping",
    "arguments": {}
  }
}
```

## List Tables

```json
{
  "jsonrpc": "2.0",
  "id": 11,
  "method": "tools/call",
  "params": {
    "name": "list_tables",
    "arguments": {}
  }
}
```

## Get Table Schema

```json
{
  "jsonrpc": "2.0",
  "id": 12,
  "method": "tools/call",
  "params": {
    "name": "get_table_schema",
    "arguments": {
      "table_name": "CUSTOMERS"
    }
  }
}
```

## Get Database Schema

```json
{
  "jsonrpc": "2.0",
  "id": 13,
  "method": "tools/call",
  "params": {
    "name": "get_database_schema",
    "arguments": {}
  }
}
```

## Execute Read-Only Query

```json
{
  "jsonrpc": "2.0",
  "id": 14,
  "method": "tools/call",
  "params": {
    "name": "execute_query",
    "arguments": {
      "sql": "SELECT ID, NAME FROM CUSTOMERS WHERE ID = ?",
      "params": [123]
    }
  }
}
```

## Server Status

```json
{
  "jsonrpc": "2.0",
  "id": 15,
  "method": "tools/call",
  "params": {
    "name": "server_status",
    "arguments": {}
  }
}
```

## Result Parsing

Most tools return structured data in both formats:

- `result.structuredContent = { ...json... }`
- `result.content[0].type = "text"`
- `result.content[0].text = "{ ...json... }"`

Compatibility guidance:

- New clients should prefer `structuredContent`.
- Existing clients can keep parsing `content[0].text`.
