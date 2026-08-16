# Phase 08: Audit Fixes — Corrección de Errores, Inconsistencias y Mejoras

Basado en auditoría integral del código fuente. Cada ítem incluye archivos, línea, diagnóstico y acción concreta.

---

## 1. 🔴 Errores / Bugs

### 1.1 Logger redacta datos operativos legítimos (host, port, database, user)

**Archivo:** `src/logging/logger.ts:28`

**Diagnóstico:** La regex `SENSITIVE_KEY_PATTERN` incluye `host`, `port`, `database`, `user`, `firebird`, que no son secretos. Cada log que incluya estas claves (ej. `server.ts:233`) mostrará `[REDACTED]`, imposibilitando la depuración en producción.

**Acción:** Separar claves verdaderamente sensibles de las operativas:

```ts
const SENSITIVE_KEY_PATTERN = /(password|secret|token|authorization|api[_-]?key|credential)/i;
```

**Prueba:** `src/logging/logger.test.ts` debe verificar que `host`, `port`, `database` NO son redactados.

---

### 1.2 Versiones de protocolo MCP incorrectas

**Archivo:** `src/mcp/protocol-version.ts:1-6`

**Diagnóstico:** Las versiones `2025-06-18` y `2025-11-25` no forman parte del estándar MCP oficial. Las versiones correctas son `2024-11-05` y `2025-03-26`. Esto causará fallos de handshake con Claude Desktop y otros clientes reales.

**Acción:**

```ts
export const DEFAULT_PROTOCOL_VERSION = '2025-03-26';
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-03-26', '2024-11-05'] as const;
```

**Archivos afectados:**
- `src/mcp/protocol-version.ts` — cambiar constantes
- `src/vscode/mcp-process-manager.ts:502` — actualizar `protocolVersion: '2025-06-18'` a `'2025-03-26'`
- `README.md`, `docs/*.md` — actualizar referencias a versiones

**Prueba:** `src/mcp/mcp-server.test.ts` — los tests que verifican handshake deben pasar con las nuevas versiones.

---

### 1.3 `MCP_READ_ONLY` y `MCP_INSIDERS` no tienen efecto

**Archivos:** `src/vscode/mcp-process-manager.ts:106-107` → `src/config/env-config.ts`

**Diagnóstico:** La extensión VS Code inyecta `MCP_READ_ONLY` y `MCP_INSIDERS` al entorno, pero `env-config.ts` nunca los lee ni usa.

**Acción:** Implementar lectura en `env-config.ts`:

```ts
// Agregar a RuntimeConfig
readOnly: boolean;

// Agregar en getRuntimeConfig()
readOnly: toBoolean(process.env.MCP_READ_ONLY, false),
```

O bien eliminar el envío desde `mcp-process-manager.ts` si no hay intención de usarlo.

**Prueba:** `src/config/env-config.test.ts` debe validar parsing de `MCP_READ_ONLY`.

---

### 1.4 `commitlint.config.js` incompatible con `@commitlint/config-conventional` v20+

**Archivo:** `commitlint.config.js`

**Diagnóstico:** `@commitlint/config-conventional` v20+ es ESM-only, pero el archivo usa `module.exports` (CommonJS).

**Acción:** Renombrar a `commitlint.config.mjs` con sintaxis ESM:

```mjs
export default {
  extends: ['@commitlint/config-conventional'],
};
```

**Prueba:** Ejecutar `pnpm commit` o `echo "test: foo" | pnpm commitlint`.

---

### 1.5 Posible incompatibilidad Zod v4

**Archivo:** `package.json:172`, `src/dtos/tool-schemas.ts`

**Diagnóstico:** `zod` `^4.3.6` instalado pero el código usa APIs de Zod v3 (`.nonempty()` y otras). Zod v4 tiene breaking changes significativos.

**Acción:** Verificar si los tests pasan con Zod v4 actual. Si fallan, dos opciones:
- **Opción A:** Fijar `zod` a `^3.23.8` (recomendada si el código usa APIs v3)
- **Opción B:** Migrar a Zod v4 (requiere revisar cada schema)

**Prueba:** `pnpm test` debe pasar sin errores.

---

### 1.6 `mapFieldType` produce `NUMERIC(x, 0)` incorrecto

**Archivo:** `src/db/firebird/firebird-adapter.ts:448-455`

**Diagnóstico:** Cuando `fieldSubType > 0` pero `fieldScale === 0`, la condición `fieldScale` es falsy y trata el tipo como SMALLINT/INTEGER en lugar de NUMERIC.

**Acción:** Cambiar la condición a `fieldSubType !== null && fieldSubType > 0 && fieldScale !== null`:

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

**Pruebas:** Agregar test que verifique que escala 0 con subType > 0 produce NUMERIC y no SMALLINT/INTEGER.

---

### 1.7 HTTP transport sin graceful shutdown en `close`

**Archivo:** `src/server.ts:198`

**Diagnóstico:** En modo HTTP, `lineReader` es `undefined`, por lo que el evento `close` del stdin nunca se registra. HTTP solo puede shut down por SIGINT/SIGTERM.

**Acción:** Agregar listener de evento `close` en el servidor HTTP:

```ts
if (httpServer) {
  httpServer.on('close', () => {
    void gracefulShutdown('http server closed');
  });
}
```

---

## 2. 🟡 Inconsistencias

### 2.1 `MCP_TOOLSET` legacy redundante

**Archivo:** `src/config/env-config.ts:248-252`

**Diagnóstico:** Se leen ambas variables `MCP_TOOLSET` y `MCP_TOOLSETS` con lógica de merge, sin documentación.

**Acción:** Eliminar soporte de `MCP_TOOLSET` (singular) y documentar `MCP_TOOLSETS` como única variable:

```ts
const toolsets = toStringList(process.env.MCP_TOOLSETS);
```

**Prueba:** `src/config/env-config.test.ts` debe actualizarse.

---

### 2.2 `FIREBIRD_ROLE` no expuesto en extensión VS Code

**Archivo:** `package.json:57-119`

**Diagnóstico:** El servidor soporta `FIREBIRD_ROLE`, pero la configuración de la extensión no expone este campo.

**Acción:** Agregar propiedad `firebirdMcp.role` en `contributes.configuration.properties`:

```json
"firebirdMcp.role": {
  "type": "string",
  "description": "Firebird SQL role for the connection"
}
```

Y actualizar `ExtensionConfig` en `extension-types.ts` y `getExtensionConfig()` en `extension.ts`.

---

### 2.3 `executeQueryMode` no expuesto en extensión VS Code

**Diagnóstico:** El servidor soporta `MCP_EXECUTE_QUERY_MODE` pero la extensión no lo expone.

**Acción:** Agregar propiedad `firebirdMcp.executeQueryMode` en la configuración de la extensión.

---

### 2.4 Duplicación de lógica de entorno entre `start()` y `testConnection()`

**Archivo:** `src/vscode/mcp-process-manager.ts`

**Diagnóstico:** Ambos métodos construyen el mismo bloque `env` de ~20 líneas.

**Acción:** Extraer a método privado:

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

## 3. 🟢 Mejoras

### 3.1 Validar contraseña no vacía en extensión

**Archivo:** `src/extension.ts:69-76`

**Acción:**

```ts
if (password && password.trim().length > 0) {
  await secretStore.setPassword(password.trim());
  vscode.window.showInformationMessage('Password set successfully.');
} else {
  vscode.window.showWarningMessage('Password cannot be empty.');
}
```

---

### 3.2 Migrar de `standard-version` a `semantic-release`

**Archivo:** `package.json:165`, script `release`

**Diagnóstico:** `standard-version` está deprecado (sin mantenimiento desde 2023).

**Acción:** Migrar a `semantic-release` o usar `release-it`:

```bash
pnpm remove standard-version
pnpm add -D semantic-release
```

Actualizar script `release` en `package.json`.

---

### 3.3 SQL Validator: permitir `EXECUTE BLOCK` read-only

**Archivo:** `src/mcp/tools/sql-validator.ts:15`

**Acción:** `EXECUTE BLOCK` puede ser read-only. Si se quiere permitir, se debe analizar su contenido interno. Alternativa: agregar una lista de excepciones configurable.

---

### 3.4 Actualizar `engines.vscode` y `@types/vscode`

**Archivo:** `package.json:10,154`

**Acción:** Actualizar a versiones más recientes:

```json
"engines": {
  "vscode": "^1.93.0"
},
"devDependencies": {
  "@types/vscode": "^1.93.0"
}
```

---

### 3.5 Agregar progreso en probe de conexión

**Archivo:** `src/vscode/mcp-process-manager.ts:181-512`

**Acción:** Emitir eventos de progreso para que la UI muestre pasos: `handshake → tools/list → ping → list_tables → execute_query`.

---

## 4. Orden de Ejecución Recomendado

| Orden | Item | Esfuerzo | Impacto | Depende de |
|-------|------|----------|---------|------------|
| 1 | 1.2 — Versiones de protocolo MCP | Bajo | 🔴 Alto | — |
| 2 | 1.3 — MCP_READ_ONLY sin efecto | Bajo | 🔴 Alto | — |
| 3 | 1.1 — Logger redacta datos operativos | Bajo | 🔴 Alto | — |
| 4 | 1.4 — commitlint ESM | Bajo | 🔴 Alto | — |
| 5 | 1.5 — Zod v4 compatibilidad | Medio | 🔴 Alto | — |
| 6 | 1.6 — mapFieldType escala cero | Bajo | 🔴 Bajo | — |
| 7 | 2.4 — Refactor buildEnv | Bajo | 🟡 Medio | — |
| 8 | 1.7 — HTTP shutdown | Bajo | 🟡 Medio | — |
| 9 | 2.1 — MCP_TOOLSET legacy | Bajo | 🟡 Bajo | — |
| 10 | 2.2 — FIREBIRD_ROLE en extensión | Bajo | 🟡 Bajo | — |
| 11 | 2.3 — executeQueryMode en extensión | Bajo | 🟡 Bajo | — |
| 12 | 3.1 — Validar contraseña vacía | Bajo | 🟢 Bajo | — |
| 13 | 3.4 — Actualizar engines/tipos | Bajo | 🟢 Bajo | — |
| 14 | 3.2 — Migrar de standard-version | Medio | 🟢 Bajo | — |
| 15 | 3.5 — Progreso en probe | Medio | 🟢 Bajo | 2.4 |
| 16 | 3.3 — EXECUTE BLOCK read-only | Alto | 🟢 Bajo | — |

---

## 5. Criterios de Aceptación

- [ ] `pnpm test` pasa sin errores (vitest)
- [ ] `pnpm lint` pasa sin errores (ESLint)
- [ ] `pnpm build` produce `dist/` sin errores (TypeScript)
- [ ] Logger no redacta host/port/database; sí redacta password/token
- [ ] Las versiones de protocolo MCP son `2025-03-26` y `2024-11-05`
- [ ] `MCP_READ_ONLY` en entorno se refleja en `RuntimeConfig`
- [ ] `commitlint` funciona con `pnpm commit`
- [ ] Zod v4 (o v3 fijado) es compatible con el código
- [ ] `FirebirdRole` es configurable desde VS Code
- [ ] `executeQueryMode` es configurable desde VS Code
- [ ] No hay lógica duplicada de buildEnv entre `start()` y `testConnection()`
- [ ] Contraseña vacía es rechazada en la extensión
- [ ] `standard-version` reemplazado por alternativa mantenida

---

## 6. Comandos de Verificación

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