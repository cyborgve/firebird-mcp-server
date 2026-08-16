import type { FirebirdConfig } from '../../config/env-config';
import firebird from 'node-firebird';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  getCapabilitiesForEngineVersion,
  getSupportedVersionRange,
  type FirebirdVersionCapabilities,
} from './firebird-version-capabilities';
import { logger } from '../../logging/logger';
import { getCachedSchema, setCachedSchema, schemaCacheKey } from '../schema-cache';

/**
 * Represents the schema structure of a single database column.
 */
export interface FirebirdColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
}

/**
 * Represents the complete schema structure of a database table.
 */
export interface FirebirdTableSchema {
  table: string;
  columns: FirebirdColumnSchema[];
}

/**
 * Encapsulates the configuration and supported capabilities state of a Firebird connection.
 */
export interface FirebirdHealth {
  configured: boolean;
  host: string;
  port: number;
  database: string;
  supportedRange: {
    minimum: '2.5';
    targetCurrent: '5.x';
  };
  detectedCapabilities: FirebirdVersionCapabilities;
}

/**
 * Represents the read-only result set returned by an executed SQL query.
 */
export interface FirebirdQueryResult {
  mode: 'read-only' | 'ad-hoc';
  rows: Array<Record<string, unknown>>;
  rowCount: number;
}

/**
 * Contains the latency and connection status of a diagnostic ping attempt.
 */
export interface FirebirdPingResult {
  connected: boolean;
  latencyMs: number;
  engineVersion?: string;
  error?: string;
}

/**
 * Represents the comprehensive runtime status of a Firebird connection, combining health checks and active ping diagnostics.
 */
export interface FirebirdRuntimeStatus extends FirebirdHealth {
  connected: boolean;
  engineVersion?: string;
  error?: string;
}

export interface FirebirdIndexInfo {
  table: string;
  index: string;
  unique: boolean;
  active: boolean;
  descending: boolean;
  expression?: string;
  columns: string[];
}

export interface FirebirdConstraintInfo {
  table: string;
  name: string;
  type: string;
  indexName?: string;
  referenceConstraint?: string;
  updateRule?: string;
  deleteRule?: string;
}

export interface FirebirdDatabaseOverview {
  configured: boolean;
  connected: boolean;
  engineVersion?: string;
  tableCount: number;
  indexCount: number;
  constraintCount: number;
}

export interface FirebirdExplainQueryPlan {
  planner: 'heuristic';
  nativeCapable: boolean;
  sql: string;
  explainable: boolean;
  readOnly: boolean;
  referencedTables: string[];
  hasJoins: boolean;
  hasSubqueries: boolean;
  estimatedComplexity: 'low' | 'medium' | 'high';
  warnings: string[];
}

export interface FirebirdRelationship {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  constraintName: string;
}

export interface FirebirdTableStats {
  table: string;
  recordCount: number;
  avgRecordLength?: number;
}

export interface FirebirdIndexUsage {
  table: string;
  index: string;
  unique: boolean;
  active: boolean;
  readCount?: number;
  usageScore: 'high' | 'medium' | 'low' | 'unused';
}

type FirebirdRow = Record<string, unknown>;

const LIST_TABLES_SQL = `
  SELECT TRIM(RDB$RELATION_NAME) AS TABLE_NAME
  FROM RDB$RELATIONS
  WHERE COALESCE(RDB$SYSTEM_FLAG, 0) = 0
    AND RDB$VIEW_BLR IS NULL
  ORDER BY 1
`;

const TABLE_SCHEMA_SQL = `
  SELECT
    TRIM(RF.RDB$FIELD_NAME) AS COLUMN_NAME,
    F.RDB$FIELD_TYPE AS FIELD_TYPE,
    F.RDB$FIELD_SUB_TYPE AS FIELD_SUB_TYPE,
    F.RDB$FIELD_LENGTH AS FIELD_LENGTH,
    F.RDB$FIELD_PRECISION AS FIELD_PRECISION,
    F.RDB$FIELD_SCALE AS FIELD_SCALE,
    RF.RDB$NULL_FLAG AS NULL_FLAG,
    RF.RDB$DEFAULT_SOURCE AS DEFAULT_SOURCE
  FROM RDB$RELATION_FIELDS RF
  JOIN RDB$FIELDS F ON RF.RDB$FIELD_SOURCE = F.RDB$FIELD_NAME
  WHERE RF.RDB$RELATION_NAME = ?
  ORDER BY RF.RDB$FIELD_POSITION
`;

const ALL_TABLES_SCHEMA_SQL = `
  SELECT
    TRIM(RF.RDB$RELATION_NAME) AS TABLE_NAME,
    TRIM(RF.RDB$FIELD_NAME) AS COLUMN_NAME,
    F.RDB$FIELD_TYPE AS FIELD_TYPE,
    F.RDB$FIELD_SUB_TYPE AS FIELD_SUB_TYPE,
    F.RDB$FIELD_LENGTH AS FIELD_LENGTH,
    F.RDB$FIELD_PRECISION AS FIELD_PRECISION,
    F.RDB$FIELD_SCALE AS FIELD_SCALE,
    RF.RDB$NULL_FLAG AS NULL_FLAG,
    RF.RDB$DEFAULT_SOURCE AS DEFAULT_SOURCE
  FROM RDB$RELATION_FIELDS RF
  JOIN RDB$FIELDS F ON RF.RDB$FIELD_SOURCE = F.RDB$FIELD_NAME
  JOIN RDB$RELATIONS R ON RF.RDB$RELATION_NAME = R.RDB$RELATION_NAME
  WHERE COALESCE(R.RDB$SYSTEM_FLAG, 0) = 0
    AND R.RDB$VIEW_BLR IS NULL
  ORDER BY RF.RDB$RELATION_NAME, RF.RDB$FIELD_POSITION
`;

const ENGINE_VERSION_SQL = `
  SELECT RDB$GET_CONTEXT('SYSTEM', 'ENGINE_VERSION') AS ENGINE_VERSION
  FROM RDB$DATABASE
`;

const LIST_INDEXES_SQL = `
  SELECT
    TRIM(I.RDB$RELATION_NAME) AS TABLE_NAME,
    TRIM(I.RDB$INDEX_NAME) AS INDEX_NAME,
    I.RDB$UNIQUE_FLAG AS UNIQUE_FLAG,
    I.RDB$INDEX_INACTIVE AS INDEX_INACTIVE,
    I.RDB$INDEX_TYPE AS INDEX_TYPE,
    I.RDB$EXPRESSION_SOURCE AS EXPRESSION_SOURCE,
    TRIM(S.RDB$FIELD_NAME) AS COLUMN_NAME,
    S.RDB$FIELD_POSITION AS FIELD_POSITION
  FROM RDB$INDICES I
  JOIN RDB$RELATIONS R ON I.RDB$RELATION_NAME = R.RDB$RELATION_NAME
  LEFT JOIN RDB$INDEX_SEGMENTS S ON I.RDB$INDEX_NAME = S.RDB$INDEX_NAME
  WHERE COALESCE(R.RDB$SYSTEM_FLAG, 0) = 0
  ORDER BY I.RDB$RELATION_NAME, I.RDB$INDEX_NAME, S.RDB$FIELD_POSITION
`;

const LIST_CONSTRAINTS_SQL = `
  SELECT
    TRIM(RC.RDB$RELATION_NAME) AS TABLE_NAME,
    TRIM(RC.RDB$CONSTRAINT_NAME) AS CONSTRAINT_NAME,
    TRIM(RC.RDB$CONSTRAINT_TYPE) AS CONSTRAINT_TYPE,
    TRIM(RC.RDB$INDEX_NAME) AS INDEX_NAME,
    TRIM(REF.RDB$CONST_NAME_UQ) AS REFERENCE_CONSTRAINT,
    TRIM(REF.RDB$UPDATE_RULE) AS UPDATE_RULE,
    TRIM(REF.RDB$DELETE_RULE) AS DELETE_RULE
  FROM RDB$RELATION_CONSTRAINTS RC
  JOIN RDB$RELATIONS R ON RC.RDB$RELATION_NAME = R.RDB$RELATION_NAME
  LEFT JOIN RDB$REF_CONSTRAINTS REF ON RC.RDB$CONSTRAINT_NAME = REF.RDB$CONSTRAINT_NAME
  WHERE COALESCE(R.RDB$SYSTEM_FLAG, 0) = 0
  ORDER BY RC.RDB$RELATION_NAME, RC.RDB$CONSTRAINT_NAME
`;

const FK_RELATIONSHIPS_SQL = `
  SELECT
    TRIM(REF.RDB$RELATION_NAME) AS SOURCE_TABLE,
    TRIM(SEG.RDB$FIELD_NAME) AS SOURCE_COLUMN,
    TRIM(PK.RDB$RELATION_NAME) AS TARGET_TABLE,
    TRIM(SEG_PK.RDB$FIELD_NAME) AS TARGET_COLUMN,
    TRIM(RC.RDB$CONSTRAINT_NAME) AS CONSTRAINT_NAME
  FROM RDB$RELATION_CONSTRAINTS RC
  JOIN RDB$REF_CONSTRAINTS REF ON RC.RDB$CONSTRAINT_NAME = REF.RDB$CONSTRAINT_NAME
  JOIN RDB$RELATION_CONSTRAINTS PK ON REF.RDB$CONST_NAME_UQ = PK.RDB$CONSTRAINT_NAME
  JOIN RDB$INDEX_SEGMENTS SEG ON RC.RDB$INDEX_NAME = SEG.RDB$INDEX_NAME
  JOIN RDB$INDEX_SEGMENTS SEG_PK ON PK.RDB$INDEX_NAME = SEG_PK.RDB$INDEX_NAME AND SEG.RDB$FIELD_POSITION = SEG_PK.RDB$FIELD_POSITION
  JOIN RDB$RELATIONS R ON RC.RDB$RELATION_NAME = R.RDB$RELATION_NAME
  WHERE COALESCE(R.RDB$SYSTEM_FLAG, 0) = 0
    AND RC.RDB$CONSTRAINT_TYPE = 'FOREIGN KEY'
  ORDER BY REF.RDB$RELATION_NAME, RC.RDB$CONSTRAINT_NAME, SEG.RDB$FIELD_POSITION
`;

export class PoolFullError extends Error {
  public constructor(limit: number) {
    super(`Connection pool has reached maximum capacity (${limit})`);
    this.name = 'PoolFullError';
  }
}

interface PoolEntry {
  database: firebird.Database;
  idleTimer: ReturnType<typeof setTimeout> | null;
  useCount: number;
}

const POOL_MAX_SIZE = 5;
const POOL_MAX_TOTAL = 20;
const POOL_IDLE_TIMEOUT_MS = 30_000;
const POOL_MAX_USES = 50;
const ACQUIRE_RETRY_MAX_ATTEMPTS = 3;
const ACQUIRE_RETRY_BASE_DELAY_MS = 200;

const pools = new Map<string, PoolEntry[]>();
let totalActiveConnections = 0;

function poolKey(config: FirebirdConfig): string {
  return `${config.host}:${config.port}/${config.database}`;
}

const VALID_CHARSETS = new Set([
  'NONE',
  'UTF8',
  'UTF-8',
  'ISO8859_1',
  'ISO8859_2',
  'ISO8859_3',
  'ISO8859_4',
  'ISO8859_5',
  'ISO8859_6',
  'ISO8859_7',
  'ISO8859_8',
  'ISO8859_9',
  'ISO8859_13',
  'WIN1250',
  'WIN1251',
  'WIN1252',
  'WIN1253',
  'WIN1254',
  'WIN1255',
  'WIN1256',
  'WIN1257',
  'WIN1258',
  'DOS437',
  'DOS850',
  'DOS865',
  'KSC_5601',
  'BIG_5',
  'GB2312',
  'EUCJ_0208',
  'SJIS_0208',
  'CYRL',
  'UNICODE_FSS',
]);

function getAttachOptions(config: FirebirdConfig): firebird.AttachOptions {
  const role = config.role?.trim();
  const charset = config.charset.trim().toUpperCase();
  if (!VALID_CHARSETS.has(charset)) {
    throw new Error(
      `Unsupported Firebird charset: '${config.charset}'. Valid charsets: ${[...VALID_CHARSETS].join(', ')}`,
    );
  }

  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ...(role ? { role } : {}),
    charset: config.charset,
    lowercase_keys: false,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function attachDatabase(config: FirebirdConfig, attempt = 1): Promise<firebird.Database> {
  if (totalActiveConnections >= POOL_MAX_TOTAL) {
    return Promise.reject(new PoolFullError(POOL_MAX_TOTAL));
  }

  return new Promise((resolve, reject) => {
    firebird.attach(getAttachOptions(config), (error, database) => {
      if (error) {
        if (attempt < ACQUIRE_RETRY_MAX_ATTEMPTS) {
          const delay = ACQUIRE_RETRY_BASE_DELAY_MS * attempt;
          logger.warning('Database attach failed, retrying', {
            attempt,
            maxAttempts: ACQUIRE_RETRY_MAX_ATTEMPTS,
            delayMs: delay,
            errorMessage: error.message,
          });
          resolve(sleep(delay).then(() => attachDatabase(config, attempt + 1)));
          return;
        }
        reject(error);
        return;
      }

      totalActiveConnections += 1;
      resolve(database);
    });
  });
}

function detachDatabase(database: firebird.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    database.detach((error) => {
      totalActiveConnections = Math.max(0, totalActiveConnections - 1);
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function acquireConnection(config: FirebirdConfig): Promise<firebird.Database> {
  const key = poolKey(config);
  const pool = pools.get(key);

  if (pool && pool.length > 0) {
    const entry = pool.pop()!;
    if (entry.idleTimer !== null) {
      clearTimeout(entry.idleTimer);
    }
    entry.useCount += 1;
    if (entry.useCount >= POOL_MAX_USES) {
      return detachDatabase(entry.database)
        .catch(() => {})
        .then(() => attachDatabase(config));
    }
    return Promise.resolve(entry.database);
  }

  return attachDatabase(config);
}

function releaseConnection(config: FirebirdConfig, database: firebird.Database): void {
  const key = poolKey(config);
  let pool = pools.get(key);

  if (!pool) {
    pool = [];
    pools.set(key, pool);
  }

  if (pool.length >= POOL_MAX_SIZE) {
    void detachDatabase(database).catch(() => {});
    return;
  }

  const idleTimer = setTimeout(() => {
    evictEntry(key, entry);
  }, POOL_IDLE_TIMEOUT_MS);

  const timerRef = idleTimer as unknown as { unref?: () => void };
  timerRef.unref?.();

  const entry: PoolEntry = { database, idleTimer, useCount: 0 };
  pool.push(entry);
}

function evictEntry(key: string, entry: PoolEntry): void {
  const pool = pools.get(key);
  if (pool) {
    const index = pool.indexOf(entry);
    if (index !== -1) {
      pool.splice(index, 1);
    }
    if (pool.length === 0) {
      pools.delete(key);
    }
  }
  void detachDatabase(entry.database).catch(() => {});
}

/**
 * Safely drains and detaches all active pseudo-pooled connections across all configurations.
 * Typically invoked during application teardown to guarantee a graceful shutdown.
 */
export async function drainPool(): Promise<void> {
  const allEntries: PoolEntry[] = [];
  for (const pool of pools.values()) {
    allEntries.push(...pool);
  }
  pools.clear();

  await Promise.allSettled(
    allEntries.map((entry) => {
      if (entry.idleTimer !== null) {
        clearTimeout(entry.idleTimer);
      }
      return detachDatabase(entry.database);
    }),
  );

  logger.debug('Connection pool drained', { closedConnections: allEntries.length });
}

function queryRows(
  database: firebird.Database,
  sql: string,
  params?: unknown[],
): Promise<FirebirdRow[]> {
  return new Promise((resolve, reject) => {
    const callback = (error: Error | null, result: unknown[] | undefined) => {
      if (error) {
        reject(error);
        return;
      }

      if (!result) {
        resolve([]);
        return;
      }

      const rows = result.filter(
        (item): item is FirebirdRow => typeof item === 'object' && item !== null,
      );
      resolve(rows);
    };

    if (params) {
      database.query(sql, params, callback);
      return;
    }

    database.query(sql, callback);
  });
}

async function withDatabasePooled<T>(
  config: FirebirdConfig,
  operation: (database: firebird.Database) => Promise<T>,
): Promise<T> {
  const database = await acquireConnection(config);
  let operationSucceeded = false;

  try {
    const result = await operation(database);
    operationSucceeded = true;
    return result;
  } finally {
    if (operationSucceeded) {
      releaseConnection(config, database);
    } else {
      await detachDatabase(database).catch(() => {});
    }
  }
}

function trimNullableString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeTableName(value: string): string {
  return value.trim().toUpperCase();
}

function mapFieldType(row: FirebirdRow): string {
  const fieldType = typeof row.FIELD_TYPE === 'number' ? row.FIELD_TYPE : null;
  const fieldSubType = typeof row.FIELD_SUB_TYPE === 'number' ? row.FIELD_SUB_TYPE : null;
  const fieldLength = typeof row.FIELD_LENGTH === 'number' ? row.FIELD_LENGTH : null;
  const fieldPrecision = typeof row.FIELD_PRECISION === 'number' ? row.FIELD_PRECISION : null;
  const fieldScale = typeof row.FIELD_SCALE === 'number' ? row.FIELD_SCALE : null;

  switch (fieldType) {
    case 7:
      return fieldSubType !== null && fieldSubType > 0 && fieldScale !== null
        ? `NUMERIC(${fieldPrecision ?? 4}, ${Math.abs(fieldScale)})`
        : 'SMALLINT';
    case 8:
      return fieldSubType !== null && fieldSubType > 0 && fieldScale !== null
        ? `NUMERIC(${fieldPrecision ?? 9}, ${Math.abs(fieldScale)})`
        : 'INTEGER';
    case 10:
      return 'FLOAT';
    case 12:
      return 'DATE';
    case 13:
      return 'TIME';
    case 14:
      return `CHAR(${fieldLength ?? '?'})`;
    case 16:
      if (fieldSubType === 1 || fieldSubType === 2) {
        return `NUMERIC(${fieldPrecision ?? 18}, ${Math.abs(fieldScale ?? 0)})`;
      }
      return 'BIGINT';
    case 23:
      return 'BOOLEAN';
    case 27:
      return 'DOUBLE PRECISION';
    case 35:
      return 'TIMESTAMP';
    case 37:
      return `VARCHAR(${fieldLength ?? '?'})`;
    case 261:
      return fieldSubType === 1 ? 'BLOB SUB_TYPE TEXT' : 'BLOB';
    default:
      return 'UNKNOWN';
  }
}

function toTrimmedUppercase(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toUpperCase();
}

function buildColumnSchema(row: FirebirdRow): FirebirdColumnSchema {
  const column: FirebirdColumnSchema = {
    name: trimNullableString(row.COLUMN_NAME) ?? 'UNKNOWN',
    type: mapFieldType(row),
    nullable: row.NULL_FLAG !== 1,
  };

  const defaultValue = trimNullableString(row.DEFAULT_SOURCE);
  if (defaultValue !== undefined) {
    column.defaultValue = defaultValue;
  }

  return column;
}

async function fetchEngineVersion(config: FirebirdConfig): Promise<string | undefined> {
  if (!config.database.trim()) {
    return undefined;
  }

  try {
    const rows = await withDatabasePooled(config, (database) =>
      queryRows(database, ENGINE_VERSION_SQL),
    );
    const row = rows[0];
    const value = row?.ENGINE_VERSION;
    return typeof value === 'string' ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Performs a passive health check strictly based on the provided configuration context.
 * Does not attempt any network connectivity.
 *
 * @param config - The database configuration to evaluate.
 * @returns The synchronously resolved health profile.
 */
export function getFirebirdHealth(config: FirebirdConfig): FirebirdHealth {
  const configured = config.database.trim().length > 0;

  return {
    configured,
    host: config.host,
    port: config.port,
    database: config.database,
    supportedRange: getSupportedVersionRange(),
    detectedCapabilities: getCapabilitiesForEngineVersion(undefined),
  };
}

/**
 * Actively attempts to establish a connection to the database and retrieve its engine version.
 *
 * @param config - The database configuration to execute the ping against.
 * @returns An object containing connectivity status, network latency, and potential errors.
 */
export async function pingFirebird(config: FirebirdConfig): Promise<FirebirdPingResult> {
  const started = Date.now();

  if (!config.database.trim()) {
    return {
      connected: false,
      latencyMs: Date.now() - started,
      error: 'FIREBIRD_DATABASE is not configured',
    };
  }

  try {
    const engineVersion = await fetchEngineVersion(config);
    return {
      connected: true,
      latencyMs: Date.now() - started,
      ...(engineVersion ? { engineVersion } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Firebird error';
    return {
      connected: false,
      latencyMs: Date.now() - started,
      error: message,
    };
  }
}

/**
 * Consolidates static configuration health and active connectivity diagnostics into a single comprehensive state.
 *
 * @param config - The targeted database configuration.
 * @returns The resolved aggregate runtime status.
 */
export async function getFirebirdRuntimeStatus(
  config: FirebirdConfig,
): Promise<FirebirdRuntimeStatus> {
  const health = getFirebirdHealth(config);
  const ping = await pingFirebird(config);

  return {
    ...health,
    connected: ping.connected,
    detectedCapabilities: getCapabilitiesForEngineVersion(ping.engineVersion),
    ...(ping.engineVersion ? { engineVersion: ping.engineVersion } : {}),
    ...(ping.error ? { error: ping.error } : {}),
  };
}

/**
 * Retrieves a list of all user-defined table names within the designated database.
 * System tables and views are deliberately excluded.
 *
 * @param config - The database configuration parameters.
 * @returns A promise that resolves to an array of uppercase table names.
 */
export async function listTables(config: FirebirdConfig): Promise<string[]> {
  if (!config.database.trim()) {
    return [];
  }

  const rows = await withDatabasePooled(config, (database) => queryRows(database, LIST_TABLES_SQL));
  return rows
    .map((row) => trimNullableString(row.TABLE_NAME))
    .filter((tableName): tableName is string => Boolean(tableName));
}

/**
 * Extracts the detailed column schema for a specific, individual table.
 *
 * @param config - The database configuration parameters.
 * @param tableName - The exact name of the table to target.
 * @returns A promise resolving to the schema definition, or `null` if the table does not exist.
 */
export async function getTableSchema(
  config: FirebirdConfig,
  tableName: string,
): Promise<FirebirdTableSchema | null> {
  if (!config.database.trim()) {
    return null;
  }

  const normalizedTable = normalizeTableName(tableName);
  if (!normalizedTable) {
    return null;
  }

  const rows = await withDatabasePooled(config, (database) =>
    queryRows(database, TABLE_SCHEMA_SQL, [normalizedTable]),
  );

  if (rows.length === 0) {
    return null;
  }

  const columns = rows.map(buildColumnSchema);

  return {
    table: normalizedTable,
    columns,
  };
}

/**
 * Extracts schema metadata for all user tables simultaneously using a single optimal SQL query.
 * This effectively circumvents the N+1 anti-pattern common in schema extractions.
 *
 * @param config - The database configuration parameters.
 * @returns A promise resolving to an array containing the schema definitions for all user tables.
 */
export async function getDatabaseSchema(config: FirebirdConfig): Promise<FirebirdTableSchema[]> {
  if (!config.database.trim()) {
    return [];
  }

  const cacheKey = schemaCacheKey(config.host, config.port, config.database);
  const cached = getCachedSchema(cacheKey);
  if (cached) {
    return cached;
  }

  const rows = await withDatabasePooled(config, (database) =>
    queryRows(database, ALL_TABLES_SCHEMA_SQL),
  );

  const tableMap = new Map<string, FirebirdColumnSchema[]>();

  for (const row of rows) {
    const tableName = trimNullableString(row.TABLE_NAME);
    if (!tableName) {
      continue;
    }

    let columns = tableMap.get(tableName);
    if (!columns) {
      columns = [];
      tableMap.set(tableName, columns);
    }

    columns.push(buildColumnSchema(row));
  }

  const schemas: FirebirdTableSchema[] = [];
  for (const [table, columns] of tableMap) {
    schemas.push({ table, columns });
  }

  setCachedSchema(cacheKey, schemas);
  return schemas;
}

/**
 * Executes a dynamically provided ad-hoc SQL query against the database context.
 *
 * @param config - The database configuration parameters.
 * @param sql - The SQL statement string to execute.
 * @param params - Optional parameter bindings for the SQL statement.
 * @param mode - The execution mode to report in the result ('read-only' or 'ad-hoc').
 * @returns A promise resolving to the resultant row collection and metadata.
 */
export async function executeQuery(
  config: FirebirdConfig,
  sql: string,
  params?: unknown[],
  mode: FirebirdQueryResult['mode'] = 'read-only',
): Promise<FirebirdQueryResult> {
  if (!config.database.trim()) {
    return {
      mode,
      rows: [],
      rowCount: 0,
    };
  }

  if (!sql.trim()) {
    return {
      mode,
      rows: [],
      rowCount: 0,
    };
  }

  const rows = await withDatabasePooled(config, (database) => queryRows(database, sql, params));

  return {
    mode,
    rows,
    rowCount: rows.length,
  };
}

/**
 * Executes a dynamically provided ad-hoc SQL query against the database context under strict read-only mode.
 *
 * @param config - The database configuration parameters.
 * @param sql - The SQL statement string to execute.
 * @param params - Optional parameter bindings for the SQL statement.
 * @returns A promise resolving to the resultant row collection and metadata.
 */
export async function executeReadOnlyQuery(
  config: FirebirdConfig,
  sql: string,
  params?: unknown[],
): Promise<FirebirdQueryResult> {
  return executeQuery(config, sql, params, 'read-only');
}

export async function listIndexes(config: FirebirdConfig): Promise<FirebirdIndexInfo[]> {
  if (!config.database.trim()) {
    return [];
  }

  const rows = await withDatabasePooled(config, (database) =>
    queryRows(database, LIST_INDEXES_SQL),
  );
  const indexMap = new Map<string, FirebirdIndexInfo>();

  for (const row of rows) {
    const table = trimNullableString(row.TABLE_NAME);
    const index = trimNullableString(row.INDEX_NAME);
    if (!table || !index) {
      continue;
    }

    const mapKey = `${table}:${index}`;
    let indexInfo = indexMap.get(mapKey);
    if (!indexInfo) {
      const expression = trimNullableString(row.EXPRESSION_SOURCE);
      indexInfo = {
        table,
        index,
        unique: row.UNIQUE_FLAG === 1,
        active: row.INDEX_INACTIVE !== 1,
        descending: row.INDEX_TYPE === 1,
        columns: [],
      };
      if (expression) {
        indexInfo.expression = expression;
      }
      indexMap.set(mapKey, indexInfo);
    }

    const column = trimNullableString(row.COLUMN_NAME);
    if (column && indexInfo) {
      indexInfo.columns.push(column);
    }
  }

  return [...indexMap.values()];
}

export async function listConstraints(config: FirebirdConfig): Promise<FirebirdConstraintInfo[]> {
  if (!config.database.trim()) {
    return [];
  }

  const rows = await withDatabasePooled(config, (database) =>
    queryRows(database, LIST_CONSTRAINTS_SQL),
  );

  return rows
    .map((row) => {
      const table = trimNullableString(row.TABLE_NAME);
      const name = trimNullableString(row.CONSTRAINT_NAME);
      if (!table || !name) {
        return null;
      }

      const indexName = trimNullableString(row.INDEX_NAME);
      const referenceConstraint = trimNullableString(row.REFERENCE_CONSTRAINT);
      const updateRule = trimNullableString(row.UPDATE_RULE);
      const deleteRule = trimNullableString(row.DELETE_RULE);

      const constraint: FirebirdConstraintInfo = {
        table,
        name,
        type: toTrimmedUppercase(row.CONSTRAINT_TYPE) || 'UNKNOWN',
      };
      if (indexName) {
        constraint.indexName = indexName;
      }
      if (referenceConstraint) {
        constraint.referenceConstraint = referenceConstraint;
      }
      if (updateRule) {
        constraint.updateRule = toTrimmedUppercase(updateRule);
      }
      if (deleteRule) {
        constraint.deleteRule = toTrimmedUppercase(deleteRule);
      }

      return constraint;
    })
    .filter((constraint): constraint is FirebirdConstraintInfo => constraint !== null);
}

export async function getDatabaseOverview(
  config: FirebirdConfig,
): Promise<FirebirdDatabaseOverview> {
  const pingResult = await pingFirebird(config);
  const [tables, indexes, constraints] = await Promise.all([
    listTables(config),
    listIndexes(config),
    listConstraints(config),
  ]);

  return {
    configured: config.database.trim().length > 0,
    connected: pingResult.connected,
    ...(pingResult.engineVersion ? { engineVersion: pingResult.engineVersion } : {}),
    tableCount: tables.length,
    indexCount: indexes.length,
    constraintCount: constraints.length,
  };
}

export function explainQueryPlan(
  config: FirebirdConfig,
  sql: string,
  capabilities?: FirebirdVersionCapabilities | null,
): FirebirdExplainQueryPlan {
  const normalizedSql = sql.trim();
  const warnings: string[] = [];
  const tableMatches = [
    ...normalizedSql.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_$.]*)/gi),
  ];
  const referencedTableSet = new Set<string>();
  for (const match of tableMatches) {
    const tableName = match[1]?.trim();
    if (tableName) {
      referencedTableSet.add(tableName.toUpperCase());
    }
  }

  const hasJoins = /\bJOIN\b/i.test(normalizedSql);
  const hasSubqueries = /\b\(\s*SELECT\b/i.test(normalizedSql);
  const referencedTables = [...referencedTableSet];

  const estimatedComplexity: 'low' | 'medium' | 'high' =
    hasSubqueries || referencedTables.length > 3
      ? 'high'
      : hasJoins || referencedTables.length > 1
        ? 'medium'
        : 'low';

  const nativeCapable = capabilities?.supportsNativeExplainPlan === true;

  if (!config.database.trim()) {
    warnings.push('FIREBIRD_DATABASE is not configured');
  } else if (nativeCapable) {
    warnings.push(
      'Firebird engine version supports native EXPLAIN PLAN; consider using isql for full engine-level plans',
    );
  } else {
    warnings.push(
      'Execution plan retrieval is heuristic; use isql with SET PLAN ON for engine-level plans',
    );
  }

  return {
    planner: 'heuristic',
    nativeCapable,
    sql: normalizedSql,
    explainable: normalizedSql.length > 0,
    readOnly: true,
    referencedTables,
    hasJoins,
    hasSubqueries,
    estimatedComplexity,
    warnings,
  };
}

export async function getEntityRelationships(
  config: FirebirdConfig,
): Promise<FirebirdRelationship[]> {
  if (!config.database.trim()) {
    return [];
  }

  const rows = await withDatabasePooled(config, (database) =>
    queryRows(database, FK_RELATIONSHIPS_SQL),
  );

  return rows
    .map((row) => {
      const sourceTable = trimNullableString(row.SOURCE_TABLE);
      const sourceColumn = trimNullableString(row.SOURCE_COLUMN);
      const targetTable = trimNullableString(row.TARGET_TABLE);
      const targetColumn = trimNullableString(row.TARGET_COLUMN);
      const constraintName = trimNullableString(row.CONSTRAINT_NAME);
      if (!sourceTable || !sourceColumn || !targetTable || !targetColumn || !constraintName) {
        return null;
      }
      return { sourceTable, sourceColumn, targetTable, targetColumn, constraintName };
    })
    .filter((r): r is FirebirdRelationship => r !== null);
}

const TABLE_STATS_SQL = `
SELECT
  TRIM(R.RDB$RELATION_NAME) AS TABLE_NAME,
  MON$RECORD_COUNT AS RECORD_COUNT,
  MON$AVG_RECORD_LENGTH AS AVG_RECORD_LENGTH
FROM MON$TABLE_STATS TS
JOIN RDB$RELATIONS R ON TS.MON$TABLE_NAME = R.RDB$RELATION_NAME
WHERE COALESCE(R.RDB$SYSTEM_FLAG, 0) = 0 AND R.RDB$VIEW_BLR IS NULL
ORDER BY 1
`;

export async function getTableStatistics(config: FirebirdConfig): Promise<FirebirdTableStats[]> {
  if (!config.database.trim()) {
    return [];
  }

  const rows = await withDatabasePooled(config, (database) => queryRows(database, TABLE_STATS_SQL));

  return rows
    .map((row) => {
      const table = trimNullableString(row.TABLE_NAME);
      if (!table) {
        return null;
      }
      const stats: FirebirdTableStats = {
        table,
        recordCount: Number(row.RECORD_COUNT) || 0,
      };
      if (row.AVG_RECORD_LENGTH != null) {
        stats.avgRecordLength = Number(row.AVG_RECORD_LENGTH);
      }
      return stats;
    })
    .filter((r): r is FirebirdTableStats => r !== null);
}

const INDEX_USAGE_SQL = `
SELECT
  TRIM(I.RDB$RELATION_NAME) AS TABLE_NAME,
  TRIM(I.RDB$INDEX_NAME) AS INDEX_NAME,
  I.RDB$UNIQUE_FLAG AS UNIQUE_FLAG,
  I.RDB$INDEX_INACTIVE AS INDEX_INACTIVE,
  COALESCE(MON$IO_STATS.MON$READS, 0) AS READ_COUNT
FROM RDB$INDICES I
JOIN RDB$RELATIONS R ON I.RDB$RELATION_NAME = R.RDB$RELATION_NAME
LEFT JOIN MON$IO_STATS ON MON$IO_STATS.MON$STAT_ID = I.RDB$INDEX_NAME AND MON$IO_STATS.MON$STAT_GROUP = 2
WHERE COALESCE(R.RDB$SYSTEM_FLAG, 0) = 0
ORDER BY I.RDB$RELATION_NAME, I.RDB$INDEX_NAME
`;

export async function getIndexUsage(config: FirebirdConfig): Promise<FirebirdIndexUsage[]> {
  if (!config.database.trim()) {
    return [];
  }

  const rows = await withDatabasePooled(config, (database) => queryRows(database, INDEX_USAGE_SQL));

  return rows
    .map((row) => {
      const table = trimNullableString(row.TABLE_NAME);
      const index = trimNullableString(row.INDEX_NAME);
      if (!table || !index) {
        return null;
      }
      const readCount = Number(row.READ_COUNT) || 0;
      const usageScore: FirebirdIndexUsage['usageScore'] =
        readCount > 1000 ? 'high' : readCount > 100 ? 'medium' : readCount > 0 ? 'low' : 'unused';
      const idx: FirebirdIndexUsage = {
        table,
        index,
        unique: row.UNIQUE_FLAG === 1 || row.UNIQUE_FLAG === true,
        active: !(row.INDEX_INACTIVE === 1 || row.INDEX_INACTIVE === true),
        usageScore,
      };
      if (readCount > 0) {
        idx.readCount = readCount;
      }
      return idx;
    })
    .filter((r): r is FirebirdIndexUsage => r !== null);
}

const GBAK_PATHS = [
  '/usr/local/bin/gbak',
  '/usr/bin/gbak',
  '/opt/firebird/bin/gbak',
  'C:\\Program Files\\Firebird\\Firebird_5_0\\bin\\gbak.exe',
  'C:\\Program Files\\Firebird\\Firebird_4_0\\bin\\gbak.exe',
  'C:\\Program Files\\Firebird\\Firebird_3_0\\bin\\gbak.exe',
  'C:\\Program Files (x86)\\Firebird\\Firebird_5_0\\bin\\gbak.exe',
  'C:\\Program Files (x86)\\Firebird\\Firebird_4_0\\bin\\gbak.exe',
  'C:\\Program Files (x86)\\Firebird\\Firebird_3_0\\bin\\gbak.exe',
];

function resolveGbak(): string {
  for (const p of GBAK_PATHS) {
    if (existsSync(p)) {
      return p;
    }
  }
  return 'gbak';
}

export function runBackup(
  config: FirebirdConfig,
  backupPath: string,
  options?: { verbose?: boolean },
): { success: boolean; output: string; error?: string } {
  const database = config.database.trim();
  if (!database) {
    return { success: false, output: '', error: 'FIREBIRD_DATABASE is not configured' };
  }

  const gbakPath = resolveGbak();
  const { user, password } = config;
  const verboseFlag = options?.verbose ? ' -V' : '';
  const command = `"${gbakPath}" -B${verboseFlag} -USER ${user ?? 'SYSDBA'} -PAS ${password ?? 'masterkey'} "${database}" "${backupPath}"`;

  try {
    const stdout = execSync(command, { encoding: 'utf8', timeout: 300_000 });
    return { success: true, output: stdout.trim() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: '', error: message };
  }
}
