# Antigravity

## Config Path

Use Antigravity MCP configuration for your workspace profile.

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

1. Reload Antigravity agent configuration.
2. Confirm MCP server registration status.
3. Run a tool call for `ping`.
4. Run a tool call for `list_tables`.
