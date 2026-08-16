/**
 * Configuration options required to establish a connection with the FirebirdSQL database.
 */
export interface FirebirdConfig {
  /** The hostname or IP address of the Firebird server. */
  host: string;
  /** The port number on which the Firebird server is listening. */
  port: number;
  /** The path or alias to the target Firebird database file. */
  database: string;
  /** The username used for database authentication. */
  user: string;
  /** The password used for database authentication. */
  password: string;
  /** An optional explicitly requested SQL role for the connection. */
  role?: string;
  /** The character set to use for the database connection (e.g., UTF8). */
  charset: string;
}

/**
 * Operational limits enforced on the Model Context Protocol (MCP) tools to ensure stability and prevent resource exhaustion.
 */
export interface McpToolLimits {
  timeoutMs: number;
  listTablesMaxItems: number;
  schemaMaxTables: number;
  schemaMaxColumnsPerTable: number;
  executeQueryMaxRows: number;
  executeQueryMaxParams: number;
  toolsPageSize: number;
}

/**
 * Defines SQL execution policy for `execute_query`.
 * `safe` enforces read-only validation while `ad-hoc` allows caller-provided SQL.
 */
export type ExecuteQueryMode = 'safe' | 'ad-hoc';

export type TelemetryExporter = 'logs' | 'none';

export interface TelemetryConfig {
  enabled: boolean;
  exporter: TelemetryExporter;
  maxStoredSpans: number;
  clientProfile?: string;
}

/**
 * The consolidated runtime configuration utilized by the MCP server, grouping transport, database, and operational limit settings.
 */
export interface RuntimeConfig {
  /** The transport method used for MCP communication. */
  mcpTransport: 'stdio' | 'http';
  /** The deeply parsed and validated Firebird environment configurations. */
  firebird: FirebirdConfig;
  /** SQL execution policy for `execute_query`. */
  executeQueryMode: ExecuteQueryMode;
  /** Allowlisted dynamic SQL identifiers usable with `{{identifier}}` templates. */
  executeQueryAllowedIdentifiers: string[];
  /** Enforces read-only policy for all SQL execution. */
  readOnly: boolean;
  /** Optional path to an external tools configuration file (`.json`, `.yaml`, `.yml`). */
  toolsConfigPath?: string;
  /** Optional active toolset profile names, parsed from comma-separated environment input. */
  toolsets: string[];
  /** Optional explicit tool allowlist parsed from comma-separated environment input. */
  enabledTools?: string[];
  /** Enables runtime `tools/reload` to refresh tool registry without process restart. */
  toolsReloadEnabled: boolean;
  /** Observability settings for MCP metrics and span emission. */
  telemetry: TelemetryConfig;
  /** The operational constraints set for MCP tool executions. */
  limits: McpToolLimits;
  /** Per-tool timeout overrides in milliseconds, keyed by tool name. */
  toolTimeoutOverrides: Record<string, number>;
  /** Optional explicit Firebird version family override for capability detection. */
  firebirdVersionFamilyOverride: string | undefined;
  /** Optional HTTP transport configuration, used only when `mcpTransport` is `http`. */
  http: {
    host: string;
    port: number;
    path: string;
    maxRequestBodyBytes: number;
    allowedOrigins: string[];
    requireAuthentication: boolean;
    authToken?: string;
    enforceProtocolVersionHeader: boolean;
  };
}

/**
 * Attempts to parse a string value into a finite number.
 *
 * @param value - The raw string input, typically from an environment variable.
 * @param fallback - The default number to return if parsing fails or results in Infinity/NaN.
 * @returns The successfully parsed number, or the fallback value.
 */
function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Parses a string value into an integer and ensures it falls within a specified inclusive range.
 *
 * @param value - The string input to parse.
 * @param fallback - The default value to return if parsing fails entirely.
 * @param min - The minimum allowed value (inclusive).
 * @param max - The maximum allowed value (inclusive).
 * @returns The bounded integer value.
 */
function toBoundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (parsed < min) {
    return min;
  }

  if (parsed > max) {
    return max;
  }

  return parsed;
}

function toBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function toTransport(value: string | undefined): 'stdio' | 'http' {
  return value?.trim().toLowerCase() === 'http' ? 'http' : 'stdio';
}

function toPath(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function toOriginAllowlist(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const unique = new Set<string>();
  for (const item of value.split(',')) {
    const normalized = item.trim();
    if (normalized.length > 0) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

function toStringList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const unique = new Set<string>();
  for (const item of value.split(',')) {
    const normalized = item.trim();
    if (normalized.length > 0) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

function toTelemetryExporter(value: string | undefined): TelemetryExporter {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'none') {
    return 'none';
  }

  return 'logs';
}

/**
 * Parses and normalizes the SQL execution mode with secure default behavior.
 *
 * @param value - Optional raw mode value from environment.
 * @returns `safe` unless an explicit `ad-hoc` override is provided.
 */
function toExecuteQueryMode(value: string | undefined): ExecuteQueryMode {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'ad-hoc' ? 'ad-hoc' : 'safe';
}

function toTimeoutOverrides(value: string | undefined): Record<string, number> {
  if (!value) {
    return {};
  }

  const overrides: Record<string, number> = {};
  for (const item of value.split(',')) {
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const toolName = trimmed.slice(0, eqIndex).trim();
    const ms = Number.parseInt(trimmed.slice(eqIndex + 1).trim(), 10);
    if (toolName && Number.isFinite(ms) && ms >= 100 && ms <= 300000) {
      overrides[toolName] = ms;
    }
  }

  return overrides;
}

/**
 * Parses a comma-separated list of identifier allowlist entries.
 *
 * @param value - Optional raw value from `MCP_EXECUTE_QUERY_ALLOWED_IDENTIFIERS`.
 * @returns Distinct uppercase identifiers.
 */
function toIdentifierAllowlist(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const unique = new Set<string>();
  for (const item of value.split(',')) {
    const normalized = item.trim().toUpperCase();
    if (normalized.length > 0) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

/**
 * Constructs and validates the complete runtime configuration from the process environment.
 * Applies strict defaults and boundary checks to ensure safe operation limits.
 *
 * @returns The fully constructed and deeply validated `RuntimeConfig` instance.
 */
export function getRuntimeConfig(): RuntimeConfig {
  const role = process.env.FIREBIRD_ROLE;
  const normalizedRole = role && role.trim().length > 0 ? role : undefined;
  const toolsConfigPath = process.env.MCP_TOOLS_CONFIG_PATH?.trim();
  const toolsets = toStringList(process.env.MCP_TOOLSETS);
  const enabledTools = toStringList(process.env.MCP_TOOLS);
  const telemetryClientProfile = process.env.MCP_TELEMETRY_CLIENT_PROFILE?.trim();
  const mcpTransport = toTransport(process.env.MCP_TRANSPORT);
  const httpHost = process.env.MCP_HTTP_HOST?.trim() || '127.0.0.1';
  const httpPort = toBoundedInteger(process.env.MCP_HTTP_PORT, 3000, 1, 65535);
  const httpPath = toPath(process.env.MCP_HTTP_PATH, '/mcp');
  const httpMaxRequestBodyBytes = toBoundedInteger(
    process.env.MCP_HTTP_MAX_BODY_BYTES,
    1024 * 1024,
    1024,
    10 * 1024 * 1024,
  );
  const httpAuthToken = process.env.MCP_HTTP_AUTH_TOKEN?.trim() || undefined;
  const firebirdDatabase = process.env.FIREBIRD_DATABASE ?? '';
  const firebirdPassword = process.env.FIREBIRD_PASSWORD;
  const bindIsLoopback = isLoopbackHost(httpHost);

  if (mcpTransport === 'http' && !bindIsLoopback && !httpAuthToken) {
    throw new Error(
      'MCP_HTTP_AUTH_TOKEN is required when MCP_TRANSPORT=http and MCP_HTTP_HOST is non-local',
    );
  }

  const httpRequireAuth = bindIsLoopback
    ? toBoolean(process.env.MCP_HTTP_REQUIRE_AUTH, false)
    : true;

  if (firebirdDatabase.trim().length > 0 && !firebirdPassword) {
    throw new Error('FIREBIRD_PASSWORD is required when FIREBIRD_DATABASE is configured');
  }

  return {
    mcpTransport,
    firebird: {
      host: process.env.FIREBIRD_HOST ?? '127.0.0.1',
      port: toNumber(process.env.FIREBIRD_PORT, 3050),
      database: firebirdDatabase,
      user: process.env.FIREBIRD_USER ?? 'SYSDBA',
      password: firebirdPassword ?? '',
      ...(normalizedRole ? { role: normalizedRole } : {}),
      charset: process.env.FIREBIRD_CHARSET ?? 'UTF8',
    },
    executeQueryMode: toExecuteQueryMode(process.env.MCP_EXECUTE_QUERY_MODE),
    executeQueryAllowedIdentifiers: toIdentifierAllowlist(
      process.env.MCP_EXECUTE_QUERY_ALLOWED_IDENTIFIERS,
    ),
    readOnly: toBoolean(process.env.MCP_READ_ONLY, false),
    ...(toolsConfigPath ? { toolsConfigPath } : {}),
    toolsets,
    enabledTools,
    toolsReloadEnabled: toBoolean(process.env.MCP_TOOLS_RELOAD_ENABLED, false),
    toolTimeoutOverrides: toTimeoutOverrides(process.env.MCP_TOOL_TIMEOUT_OVERRIDES),
    firebirdVersionFamilyOverride:
      process.env.MCP_FIREBIRD_VERSION_FAMILY_OVERRIDE?.trim() || undefined,
    telemetry: {
      enabled: toBoolean(process.env.MCP_TELEMETRY_ENABLED, false),
      exporter: toTelemetryExporter(process.env.MCP_TELEMETRY_EXPORTER),
      maxStoredSpans: toBoundedInteger(process.env.MCP_TELEMETRY_MAX_STORED_SPANS, 200, 10, 5000),
      ...(telemetryClientProfile ? { clientProfile: telemetryClientProfile } : {}),
    },
    limits: {
      timeoutMs: toBoundedInteger(process.env.MCP_TOOL_TIMEOUT_MS, 10000, 1000, 120000),
      listTablesMaxItems: toBoundedInteger(process.env.MCP_LIST_TABLES_MAX_ITEMS, 500, 1, 10000),
      schemaMaxTables: toBoundedInteger(process.env.MCP_SCHEMA_MAX_TABLES, 200, 1, 5000),
      schemaMaxColumnsPerTable: toBoundedInteger(
        process.env.MCP_SCHEMA_MAX_COLUMNS_PER_TABLE,
        300,
        1,
        2000,
      ),
      executeQueryMaxRows: toBoundedInteger(process.env.MCP_EXECUTE_QUERY_MAX_ROWS, 200, 1, 10000),
      executeQueryMaxParams: toBoundedInteger(process.env.MCP_EXECUTE_QUERY_MAX_PARAMS, 50, 0, 500),
      toolsPageSize: toBoundedInteger(process.env.MCP_TOOLS_PAGE_SIZE, 50, 5, 500),
    },
    http: {
      host: httpHost,
      port: httpPort,
      path: httpPath,
      maxRequestBodyBytes: httpMaxRequestBodyBytes,
      allowedOrigins: toOriginAllowlist(process.env.MCP_HTTP_ALLOWED_ORIGINS),
      requireAuthentication: httpRequireAuth,
      ...(httpAuthToken ? { authToken: httpAuthToken } : {}),
      enforceProtocolVersionHeader: toBoolean(process.env.MCP_HTTP_ENFORCE_PROTOCOL_VERSION, true),
    },
  };
}
