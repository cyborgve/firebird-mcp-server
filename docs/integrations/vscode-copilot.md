# VS Code (Copilot)

## Config Path

Use workspace config:

- `.vscode/mcp.json`

## Recommended Config

```json
{
  "servers": {
    "mcp-firebird": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/dist/server.js"],
      "envFile": "${workspaceFolder}/.env",
      "env": {
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

## Smoke Test

1. Open Copilot Chat in agent mode.
2. Confirm the MCP server appears as active.
3. Ask: `call ping tool`.
4. Ask: `list tables`.
