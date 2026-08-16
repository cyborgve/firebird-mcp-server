# Cursor

## Config Path

- `.cursor/mcp.json`

Current workspace already includes this file with the recommended baseline config.

## Recommended Config

```json
{
  "mcpServers": {
    "firebird": {
      "command": "node",
      "args": ["./dist/server.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "FIREBIRD_HOST": "127.0.0.1",
        "FIREBIRD_PORT": "3050",
        "FIREBIRD_DATABASE": "",
        "FIREBIRD_USER": "SYSDBA",
        "FIREBIRD_PASSWORD": ""
      }
    }
  }
}
```

## Smoke Test

1. Open Cursor MCP settings and confirm active status.
2. Run a prompt that triggers `ping`.
3. Run a prompt that triggers `list_tables`.
