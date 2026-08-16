# Deployment

## Supported Runtime Model

This implementation supports:

- `stdio` (default, local process model)
- optional `http` transport (`MCP_TRANSPORT=http`) with explicit security controls

Typical flow:

1. Build TypeScript output (`dist/`)
2. Start server process
3. Connect from an MCP client through process streams

For HTTP mode:

1. Set `MCP_TRANSPORT=http`
2. Bind host/port/path (`MCP_HTTP_HOST`, `MCP_HTTP_PORT`, `MCP_HTTP_PATH`)
3. Configure `MCP_HTTP_AUTH_TOKEN` and `MCP_HTTP_ALLOWED_ORIGINS`
4. Send JSON-RPC requests over `POST` to configured path

## Build and Run

```bash
pnpm install
pnpm run build
pnpm run start
```

## Process Management

For production-like environments, run the process under a supervisor:

- systemd
- PM2
- container runtime entrypoint

Ensure supervisor captures `stderr` for logs.

For HTTP mode, place the service behind TLS termination (reverse proxy or ingress) and keep token distribution in a secret manager.

## Environment Preparation

- Provide Firebird connection variables
- Provide limit variables appropriate for workload
- Use read-only DB credentials

HTTP-specific preparation:

- Keep `MCP_HTTP_HOST=127.0.0.1` for local-only deployments.
- If binding non-local host, set `MCP_HTTP_AUTH_TOKEN` (startup fails otherwise).
- Set explicit `MCP_HTTP_ALLOWED_ORIGINS` for browser-based clients.
- Keep `MCP_HTTP_ENFORCE_PROTOCOL_VERSION=true`.

## Shutdown Behavior

The server performs graceful shutdown on:

- `SIGINT`
- `SIGTERM`
- `stdin` close

It waits for in-flight requests (with timeout) and then drains the Firebird pool.

## VS Code Extension Release

The extension is published to the VS Code Marketplace automatically via GitHub Actions.

### Release Process

1. Ensure all changes are committed and tests pass.
2. Use `pnpm run release` to bump version and create a git tag (e.g., `v0.3.0`).
3. Push the tag to trigger the publish workflow.
4. The workflow will build, test, package, and publish the extension using the `VSCE_PAT` secret.

### Manual Publish

If needed, run `pnpm run publish:vsce` locally with `VSCE_PAT` set.

### Requirements

- A VS Code Marketplace publisher account.
- `VSCE_PAT` personal access token with publish permissions stored as a GitHub secret.
- Icon asset (128x128 PNG) in the extension root (currently missing, add `assets/icon.png`).
