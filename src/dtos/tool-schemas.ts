import { z } from 'zod';

/**
 * Standardized strict schema for tools that intentionally accept no parameters (e.g., `ping`, `server_status`).
 */
export const emptyArgsSchema = z.object({}).strict();

/**
 * Defines and validates the required parameters for the `get_table_schema` tool.
 */
export const getTableSchemaArgsSchema = z
  .object({
    table_name: z.string().trim().min(1, 'table_name must not be empty'),
  })
  .strict();

/**
 * Defines and validates the required parameters and optional bindings for the `execute_query` tool.
 */
const sqlParamValueSchema = z.union([
  z.string().max(4000, 'param string exceeds max length 4000'),
  z.number().finite('param number must be finite'),
  z.boolean(),
  z.null(),
]);

export const executeQueryArgsSchema = z
  .object({
    sql: z.string().trim().min(1, 'sql must not be empty'),
    params: z.array(sqlParamValueSchema).optional(),
    identifiers: z.record(z.string(), z.string().trim().min(1)).optional(),
  })
  .strict();

export const explainQueryPlanArgsSchema = z
  .object({
    sql: z.string().trim().min(1, 'sql must not be empty'),
    params: z.array(sqlParamValueSchema).optional(),
  })
  .strict();

export const getDatabaseSchemaArgsSchema = z
  .object({
    offset: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(5000).optional(),
  })
  .strict();

/**
 * Statically inferred TypeScript DTO types derived natively from the Zod runtime schemas.
 */
export type EmptyArgs = z.infer<typeof emptyArgsSchema>;
export type GetTableSchemaArgs = z.infer<typeof getTableSchemaArgsSchema>;
export type ExecuteQueryArgs = z.infer<typeof executeQueryArgsSchema>;
export type ExplainQueryPlanArgs = z.infer<typeof explainQueryPlanArgsSchema>;

export const getEntityRelationshipsArgsSchema = z.object({}).strict();
export const getTableStatisticsArgsSchema = z.object({}).strict();
export const analyzeIndexUsageArgsSchema = z.object({}).strict();
export const backupDatabaseArgsSchema = z
  .object({
    backup_path: z.string().trim().min(1, 'backup_path must not be empty'),
    verbose: z.boolean().optional(),
  })
  .strict();
