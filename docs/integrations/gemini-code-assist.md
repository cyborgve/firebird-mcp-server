# Gemini Code Assist

## Config Path

Use the Gemini Code Assist MCP settings for your workspace.

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

1. Enable agent mode in Gemini Code Assist.
2. Confirm MCP server registration.
3. Trigger `ping` and `list_tables` through natural-language prompts.
