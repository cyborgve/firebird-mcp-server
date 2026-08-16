import type { FirebirdTableSchema } from '../db/firebird/firebird-adapter';
import type {
  FirebirdConstraintInfo,
  FirebirdDatabaseOverview,
  FirebirdExplainQueryPlan,
  FirebirdIndexInfo,
} from '../db/firebird/firebird-adapter';

/**
 * Defines the structured payload returned by the 'ping' tool.
 * Provides granular observability into the database connectivity status.
 */
export interface PingResponse {
  status: 'ok' | 'degraded';
  server: string;
  transport: string;
  firebirdConfigured: boolean;
  firebirdConnected: boolean;
  latencyMs: number;
  engineVersion?: string;
  error?: string;
}

/**
 * Defines the payload returned by the 'server_status' tool, verifying the basic health of the MCP instance.
 */
export interface ServerStatusResponse {
  server: 'ok';
  transport: string;
  firebird: unknown;
}

/**
 * Defines the response payload for the 'list_tables' tool.
 * Supports indicating truncated result sets to prevent payload bloat.
 */
export interface ListTablesResponse {
  tables: string[];
  truncated: boolean;
  maxItems: number;
}

/**
 * Defines the response payload for the 'get_table_schema' tool, fetching detailed column metadata for a single table.
 */
export interface GetTableSchemaResponse {
  schema: FirebirdTableSchema | null;
}

/**
 * Defines the response payload for the 'get_database_schema' tool.
 * Implements strict pagination indicators across dimension axes (tables and columns) to maintain performance.
 */
export interface GetDatabaseSchemaResponse {
  schema: FirebirdTableSchema[];
  truncated: boolean;
  tableTruncated: boolean;
  columnTruncatedTables: number;
  truncatedColumns: number;
  maxTables: number;
  maxColumnsPerTable: number;
  offset: number;
  totalTables: number;
}

/**
 * Data transfer object outlining the structured metadata of a single database column.
 */
export interface ColumnSchemaDto {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
}

/**
 * Data transfer object defining the full schema composition of a database table.
 */
export interface TableSchemaDto {
  table: string;
  columns: ColumnSchemaDto[];
}

/**
 * Defines the payload for the 'execute_query' tool.
 * Guarantees read-only execution modes and precise tracking of truncated data frames.
 */
export interface ExecuteQueryResponse {
  mode: 'read-only' | 'ad-hoc';
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  truncated: boolean;
  maxRows: number;
  totalRowsBeforeLimit: number;
}

export interface ListIndexesResponse {
  indexes: FirebirdIndexInfo[];
}

export interface ListConstraintsResponse {
  constraints: FirebirdConstraintInfo[];
}

export interface DatabaseOverviewResponse {
  overview: FirebirdDatabaseOverview;
}

export interface ExplainQueryPlanResponse {
  plan: FirebirdExplainQueryPlan;
}

import type {
  FirebirdRelationship,
  FirebirdTableStats,
  FirebirdIndexUsage,
} from '../db/firebird/firebird-adapter';

export interface EntityRelationshipsResponse {
  relationships: FirebirdRelationship[];
}

export interface TableStatisticsResponse {
  statistics: FirebirdTableStats[];
}

export interface AnalyzeIndexUsageResponse {
  indexes: FirebirdIndexUsage[];
}

export interface BackupDatabaseResponse {
  success: boolean;
  output: string;
  error?: string;
}
