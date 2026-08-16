# Copilot CLI

## Config Path

Use your Copilot CLI MCP configuration file (user-level or project-level, depending on your setup).

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

1. Start Copilot CLI with MCP enabled.
2. Verify the server is discovered.
3. Invoke `ping`.
4. Invoke `list_tables`.
