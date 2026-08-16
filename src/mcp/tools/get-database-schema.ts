import type { McpToolHandler, McpToolResult } from './types';
import { takeAtMost, toolTextResult } from './tool-utils';
import { getDatabaseSchema } from '../../db/firebird/firebird-adapter';
import { getDatabaseSchemaArgsSchema } from '../../dtos/tool-schemas';
import { ToolValidationError } from '../../errors/index';
import type { GetDatabaseSchemaResponse } from '../../dtos/tool-responses';

/**
 * Applies strict pagination limits strictly to the column arrays within an already fetched schema layout.
 * Accurately calculates internal truncation metrics for accurate downstream payload reporting.
 *
 * @param schema - The raw collection of retrieved table schemas.
 * @param maxColumnsPerTable - The strict architectural limit for columns per individual table payload.
 * @returns The size-bounded schema fragment alongside cumulative truncation statistics.
 */
function mapSchemaWithColumnLimit(
  schema: Awaited<ReturnType<typeof getDatabaseSchema>>,
  maxColumnsPerTable: number,
): {
  schema: Awaited<ReturnType<typeof getDatabaseSchema>>;
  truncatedTables: number;
  truncatedColumns: number;
} {
  let truncatedTables = 0;
  let truncatedColumns = 0;

  const mappedSchema = schema.map((tableSchema) => {
    if (tableSchema.columns.length <= maxColumnsPerTable) {
      return tableSchema;
    }

    truncatedTables += 1;
    truncatedColumns += tableSchema.columns.length - maxColumnsPerTable;

    return {
      ...tableSchema,
      columns: tableSchema.columns.slice(0, maxColumnsPerTable),
    };
  });

  return {
    schema: mappedSchema,
    truncatedTables,
    truncatedColumns,
  };
}

/**
 * Tool handler responsible for extracting a comprehensive metadata snapshot of all user-defined database tables.
 *
 * Employs a single optimal SQL query strategy via the adapter to completely circumvent the N+1 anti-pattern.
 * Implements sophisticated two-dimensional payload truncation (tables and columns) to ensure transmission viability.
 */
export const getDatabaseSchemaTool: McpToolHandler = {
  definition: {
    name: 'get_database_schema',
    description: 'Returns schema metadata for all user tables',
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },

  async execute(args, context): Promise<McpToolResult> {
    const parsed = getDatabaseSchemaArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      throw new ToolValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const { limits } = context.config;
    const schema = await getDatabaseSchema(context.config.firebird);

    const tableOffset = parsed.data.offset ?? 0;
    const tableLimit = Math.min(
      parsed.data.limit ?? limits.schemaMaxTables,
      limits.schemaMaxTables,
    );
    const paginatedTables = schema.slice(tableOffset, tableOffset + tableLimit);
    const limitedTables = takeAtMost(paginatedTables, tableLimit);
    const limitedSchema = mapSchemaWithColumnLimit(
      limitedTables.values,
      limits.schemaMaxColumnsPerTable,
    );

    const response: GetDatabaseSchemaResponse = {
      schema: limitedSchema.schema,
      truncated: limitedTables.truncated || limitedSchema.truncatedColumns > 0,
      tableTruncated: limitedTables.truncated,
      columnTruncatedTables: limitedSchema.truncatedTables,
      truncatedColumns: limitedSchema.truncatedColumns,
      maxTables: limits.schemaMaxTables,
      maxColumnsPerTable: limits.schemaMaxColumnsPerTable,
      offset: tableOffset,
      totalTables: schema.length,
    };

    return toolTextResult(response);
  },
};
