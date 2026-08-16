# Windsurf

## Config Path

Use Windsurf MCP settings for the current workspace.

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

1. Open Windsurf in repository root.
2. Verify MCP server appears as connected.
3. Invoke `ping` and `list_tables` from the chat.
