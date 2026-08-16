# Cline

## Config Path

Use the MCP server configuration file exposed by Cline in VS Code.

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

1. Confirm server status is active in Cline MCP panel.
2. Ask Cline to call `ping`.
3. Ask Cline to list database tables.
