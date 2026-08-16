# Contributing to Firebird MCP Server

First off, thank you for considering contributing to the Firebird MCP Server! It's people like you that make open source such a great community.

## Development Setup

1. **Fork** the repository and clone it locally.
2. **Install dependencies** using `pnpm`:
   ```bash
   pnpm install
   ```
3. **Build the project**:
   ```bash
   pnpm run build
   ```

## Workflow

1. Create a new branch for your feature or bugfix:
   ```bash
   git checkout -b feature/my-new-feature
   ```
2. Make your changes and commit them using [Conventional Commits](https://www.conventionalcommits.org/):
   ```bash
   git commit -m "feat: add new awesome feature"
   ```
3. Ensure all tests and linting pass locally:
   ```bash
   pnpm run lint
   pnpm run test
   ```
4. Push your branch and open a Pull Request.

## Pull Request Guidelines

- We use GitHub Actions to enforce CI checks (Tests, Linting, and Commit formatting).
- Please ensure your PR passes all status checks.
- Keep PRs focused on a single issue or feature.
- Update the `README.md` if your changes add new configuration parameters or tools.

## Testing Locally

To test the MCP server locally with the official MCP Inspector:
```bash
npx @modelcontextprotocol/inspector node dist/server.js
```
*Note: Make sure to export your `FIREBIRD_*` environment variables before running the inspector.*
