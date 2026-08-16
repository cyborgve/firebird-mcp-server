# Editor Integrations

This folder contains setup guides for MCP client integrations.

## Supported Editors

- [VS Code (Copilot)](vscode-copilot.md)
- [Copilot CLI](copilot-cli.md)
- [Cursor](cursor.md)
- [Cline](cline.md)
- [Gemini CLI](gemini-cli.md)
- [Gemini Code Assist](gemini-code-assist.md)
- [Claude Desktop](claude-desktop.md)
- [Claude Code](claude-code.md)
- [Windsurf](windsurf.md)
- [Antigravity](antigravity.md)

## Templates

- [Generic stdio template](templates/mcp-stdio-template.json)
- [VS Code Copilot template](templates/vscode-copilot.mcp.json)
- [Copilot CLI template](templates/copilot-cli.mcp.json)
- [Cursor template](templates/cursor.mcp.json)
- [Cline template](templates/cline.mcp.json)
- [Gemini CLI template](templates/gemini-cli.mcp.json)
- [Gemini Code Assist template](templates/gemini-code-assist.mcp.json)
- [Claude Desktop template](templates/claude-desktop.mcp.json)
- [Claude Code template](templates/claude-code.mcp.json)
- [Windsurf template](templates/windsurf.mcp.json)
- [Antigravity template](templates/antigravity.mcp.json)

## Validation Checklist

After configuring any editor, validate the integration with this sequence:

1. Start the MCP server.
2. Run `initialize`.
3. Run `tools/list`.
4. Run `tools/call` with `ping`.
5. Run `tools/call` with `list_tables`.

If step 4 succeeds and step 5 returns either a list or an empty list, the integration is healthy.

For per-editor tracking and reproducible evidence collection, use [Smoke Test Matrix](smoke-test-matrix.md).

For diagnostics and remediations, use [Troubleshooting Playbook](troubleshooting-playbook.md).

For VS Code extension quick diagnostics, run:

- `Firebird MCP Server: Test Firebird MCP Connection`
- `Firebird MCP Server: Test Firebird MCP Connection (Extended)`
