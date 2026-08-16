# Phase 08: Audit Fixes — Bug Fixes, Inconsistencies, and Improvements

Based on a comprehensive audit of the source code. Each item includes the file, line, diagnosis, and concrete action.

---

## 1. 🔴 Errors / Bugs

### 1.1 Logger redacts legitimate operational data (host, port, database, user)

**File:** `src/logging/logger.ts:28`

**Diagnosis:** The `SENSITIVE_KEY_PATTERN` regex includes `host`, `port`, `database`, `user`, `firebird`, which are not secrets. Any log containing these keys (e.g., `server.ts:233`) will show `[REDACTED]`, making production debugging impossible.

**Action:** Separate truly sensitive keys from operational ones:

```ts
const SENSITIVE_KEY_PATTERN = /(password|secret|token|authorization|api[_-]?key|credential)/i;
```

**Test:** `src/logging/logger.test.ts` must verify that `host`, `port`, and `database` are NOT redacted.

---

### 1.2 Incorrect MCP protocol versions

**File:** `src/mcp/protocol-version.ts:1-6`

**Diagnosis:** Versions `2025-06-18` and `2025-11-25` are not part of the official MCP standard. The correct versions are `2024-11-05` and `2025-03-26`. This will cause handshake failures with Claude Desktop and other real clients.

**Action:**

```ts
export const DEFAULT_PROTOCOL_VERSION = '2025-03-26';
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-03-26', '2024-11-05'] as const;
```

**Affected files:**
- `src/mcp/protocol-version.ts` — update constants
- `src/vscode/mcp-process-manager.ts:502` — update `protocolVersion: '2025-06-18'` to `'2025-03-26'`
- `README.md`, `docs/*.md` — update version references

**Test:** `src/mcp/mcp-server.test.ts` — tests verifying the handshake must pass with the new versions.

---

### 1.3 `MCP_READ_ONLY` and `MCP_INSIDERS` have no effect

**Files:** `src/vscode/mcp-process-manager.ts:106-107` → `src/config/env-config.ts`

**Diagnosis:** The VS Code extension injects `MCP_READ_ONLY` and `MCP_INSIDERS` into the environment, but `env-config.ts` never reads or uses them.

**Action:** Implement reading in `env-config.ts`:

```ts
// Add to RuntimeConfig
readOnly: boolean;

// Add to getRuntimeConfig()
readOnly: toBoolean(process.env.MCP_READ_ONLY, false),
```

Alternatively, remove the variables from `mcp-process-manager.ts` if there is no intent to use them.

**Test:** `src/config/env-config.test.ts` must validate the parsing of `MCP_READ_ONLY`.

---

### 1.4 `commitlint.config.js` incompatible with `@commitlint/config-conventional` v20+

**File:** `commitlint.config.js`

**Diagnosis:** `@commitlint/config-conventional` v20+ is ESM-only, but the file uses `module.exports` (CommonJS).

**Action:** Rename to `commitlint.config.mjs` with ESM syntax:

```mjs
export default {
  extends: ['@commitlint/config-conventional'],
};
```

**Test:** Run `pnpm commit` or `echo "test: foo" | pnpm commitlint`.

---

### 1.5 Possible Zod v4 incompatibility

**File:** `package.json:172`, `src/dtos/tool-schemas.ts`

**Diagnosis:** `zod` `^4.3.6` is installed but the code uses Zod v3 APIs (`.nonempty()` and others). Zod v4 has significant breaking changes.

**Action:** Verify if tests pass with the current Zod v4. If they fail, there are two options:
- **Option A:** Pin `zod` to `^3.23.8` (recommended if the code uses v3 APIs)
- **Option B:** Migrate to Zod v4 (requires reviewing each schema)

**Test:** `pnpm test` must pass without errors.

---

### 1.6 `mapFieldType` incorrectly produces `NUMERIC(x, 0)`

**File:** `src/db/firebird/firebird-adapter.ts:448-455`

**Diagnosis:** When `fieldSubType > 0` but `fieldScale === 0`, the `fieldScale` condition is falsy and treats the type as SMALLINT/INTEGER instead of NUMERIC.

**Action:** Change the condition to `fieldSubType !== null && fieldSubType > 0 && fieldScale !== null`:

```ts
case 7:
  return fieldSubType !== null && fieldSubType > 0 && fieldScale !== null
    ? `NUMERIC(${fieldPrecision ?? 4}, ${Math.abs(fieldScale)})`
    : 'SMALLINT';
case 8:
  return fieldSubType !== null && fieldSubType > 0 && fieldScale !== null
    ? `NUMERIC(${fieldPrecision ?? 9}, ${Math.abs(fieldScale)})`
    : 'INTEGER';
case 16:
  if (fieldSubType === 1 || fieldSubType === 2) {
    return `NUMERIC(${fieldPrecision ?? 18}, ${Math.abs(fieldScale ?? 0)})`;
  }
  return 'BIGINT';
```

**Tests:** Add a test verifying that scale 0 with subType > 0 produces NUMERIC and not SMALLINT/INTEGER.

---

### 1.7 HTTP transport lacks graceful shutdown on `close`

**File:** `src/server.ts:198`

**Diagnosis:** In HTTP mode, `lineReader` is `undefined`, so the `close` event from stdin is never registered. HTTP can only shut down via SIGINT/SIGTERM.

**Action:** Add a `close` event listener to the HTTP server:

```ts
if (httpServer) {
  httpServer.on('close', () => {
    void gracefulShutdown('http server closed');
  });
}
```

---

## 2. 🟡 Inconsistencies

### 2.1 Redundant legacy `MCP_TOOLSET`

**File:** `src/config/env-config.ts:248-252`

**Diagnosis:** Both `MCP_TOOLSET` and `MCP_TOOLSETS` variables are read with merge logic, without documentation.

**Action:** Remove support for `MCP_TOOLSET` (singular) and document `MCP_TOOLSETS` as the sole variable:

```ts
const toolsets = toStringList(process.env.MCP_TOOLSETS);
```

**Test:** `src/config/env-config.test.ts` must be updated.

---

### 2.2 `FIREBIRD_ROLE` not exposed in VS Code extension

**File:** `package.json:57-119`

**Diagnosis:** The server supports `FIREBIRD_ROLE`, but the extension configuration does not expose this field.

**Action:** Add the `firebirdMcp.role` property to `contributes.configuration.properties`:

```json
"firebirdMcp.role": {
  "type": "string",
  "description": "Firebird SQL role for the connection"
}
```

And update `ExtensionConfig` in `extension-types.ts` and `getExtensionConfig()` in `extension.ts`.

---

### 2.3 `executeQueryMode` not exposed in VS Code extension

**Diagnosis:** The server supports `MCP_EXECUTE_QUERY_MODE` but the extension does not expose it.

**Action:** Add the `firebirdMcp.executeQueryMode` property to the extension configuration.

---

### 2.4 Duplicated environment logic between `start()` and `testConnection()`

**File:** `src/vscode/mcp-process-manager.ts`

**Diagnosis:** Both methods construct the same `env` block of ~20 lines.

**Action:** Extract to a private method:

```ts
private buildEnv(config: ExtensionConfig, password: string): Record<string, string | undefined> {
  return {
    ...process.env,
    FIREBIRD_HOST: config.host,
    FIREBIRD_DATABASE: config.database || '',
    FIREBIRD_PORT: config.port.toString(),
    FIREBIRD_USER: config.user,
    FIREBIRD_PASSWORD: password,
    LOG_LEVEL: config.logLevel,
    MCP_TELEMETRY_CLIENT_PROFILE: 'vscode',
    ...(config.toolsets?.length ? { MCP_TOOLSETS: config.toolsets.join(',') } : {}),
    ...(config.tools?.length ? { MCP_TOOLS: config.tools.join(',') } : {}),
  };
}
```

---

## 3. 🟢 Improvements

### 3.1 Validate non-empty password in extension

**File:** `src/extension.ts:69-76`

**Action:**

```ts
if (password && password.trim().length > 0) {
  await secretStore.setPassword(password.trim());
  vscode.window.showInformationMessage('Password set successfully.');
} else {
  vscode.window.showWarningMessage('Password cannot be empty.');
}
```

---

### 3.2 Migrate from `standard-version` to `semantic-release`

**File:** `package.json:165`, script `release`

**Diagnosis:** `standard-version` is deprecated (unmaintained since 2023).

**Action:** Migrate to `semantic-release` or use `release-it`:

```bash
pnpm remove standard-version
pnpm add -D semantic-release
```

Update the `release` script in `package.json`.

---

### 3.3 SQL Validator: allow read-only `EXECUTE BLOCK`

**File:** `src/mcp/tools/sql-validator.ts:15`

**Action:** `EXECUTE BLOCK` can be read-only. To allow it, its internal contents must be parsed. Alternative: add a configurable exceptions list.

---

### 3.4 Update `engines.vscode` and `@types/vscode`

**File:** `package.json:10,154`

**Action:** Update to more recent versions:

```json
"engines": {
  "vscode": "^1.93.0"
},
"devDependencies": {
  "@types/vscode": "^1.93.0"
}
```

---

### 3.5 Add progress to connection probe

**File:** `src/vscode/mcp-process-manager.ts:181-512`

**Action:** Emit progress events so the UI displays steps: `handshake → tools/list → ping → list_tables → execute_query`.

---

## 4. Recommended Execution Order

| Order | Item | Effort | Impact | Depends on |
|-------|------|--------|--------|------------|
| 1 | 1.2 — MCP protocol versions | Low | 🔴 High | — |
| 2 | 1.3 — Ineffective MCP_READ_ONLY | Low | 🔴 High | — |
| 3 | 1.1 — Logger redacts operational data | Low | 🔴 High | — |
| 4 | 1.4 — ESM commitlint | Low | 🔴 High | — |
| 5 | 1.5 — Zod v4 compatibility | Medium | 🔴 High | — |
| 6 | 1.6 — mapFieldType zero scale | Low | 🔴 Low | — |
| 7 | 2.4 — Refactor buildEnv | Low | 🟡 Medium | — |
| 8 | 1.7 — HTTP shutdown | Low | 🟡 Medium | — |
| 9 | 2.1 — Legacy MCP_TOOLSET | Low | 🟡 Low | — |
| 10 | 2.2 — FIREBIRD_ROLE in extension | Low | 🟡 Low | — |
| 11 | 2.3 — executeQueryMode in extension | Low | 🟡 Low | — |
| 12 | 3.1 — Empty password validation | Low | 🟢 Low | — |
| 13 | 3.4 — Update engines/types | Low | 🟢 Low | — |
| 14 | 3.2 — Migrate from standard-version | Medium | 🟢 Low | — |
| 15 | 3.5 — Probe progress | Medium | 🟢 Low | 2.4 |
| 16 | 3.3 — Read-only EXECUTE BLOCK | High | 🟢 Low | — |

---

## 5. Acceptance Criteria

- [ ] `pnpm test` passes without errors (vitest)
- [ ] `pnpm lint` passes without errors (ESLint)
- [ ] `pnpm build` produces `dist/` without errors (TypeScript)
- [ ] Logger does not redact host/port/database; it does redact password/token
- [ ] MCP protocol versions are `2025-03-26` and `2024-11-05`
- [ ] `MCP_READ_ONLY` in environment is reflected in `RuntimeConfig`
- [ ] `commitlint` works with `pnpm commit`
- [ ] Zod v4 (or pinned v3) is compatible with the code
- [ ] `FirebirdRole` is configurable from VS Code
- [ ] `executeQueryMode` is configurable from VS Code
- [ ] No duplicated buildEnv logic between `start()` and `testConnection()`
- [ ] Empty password is rejected in the extension
- [ ] `standard-version` is replaced by a maintained alternative

---

## 6. Verification Commands

```bash
# Tests
pnpm test

# Lint
pnpm lint

# Build
pnpm build

# Commit lint
echo "fix: correct MCP protocol versions" | pnpx commitlint

# Smoke test stdio
pnpm smoke:stdio

# Smoke test with evidence
pnpm smoke:stdio:evidence
```