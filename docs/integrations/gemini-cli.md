# Gemini CLI

## Config Path

- `.gemini/settings.json`

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

1. Launch Gemini CLI in the project directory.
2. Confirm MCP server is loaded.
3. Run a prompt that invokes `ping`.
4. Run a prompt that invokes `list_tables`.
