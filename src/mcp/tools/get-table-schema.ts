import type { McpToolHandler, McpToolResult } from './types';
import { ToolValidationError } from '../../errors/index';
import { toolTextResult } from './tool-utils';
import { getTableSchema } from '../../db/firebird/firebird-adapter';
import { getTableSchemaArgsSchema } from '../../dtos/tool-schemas';
import type { GetTableSchemaResponse } from '../../dtos/tool-responses';

/**
 * Tool handler dedicated to fetching the granular structural metadata (columns, data types, nullability constraint)
 * for a singular targeted database table.
 */
export const getTableSchemaTool: McpToolHandler = {
  definition: {
    name: 'get_table_schema',
    description: 'Returns schema metadata for a specific table',
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        table_name: {
          type: 'string',
        },
      },
      required: ['table_name'],
      additionalProperties: false,
    },
  },

  async execute(args, context): Promise<McpToolResult> {
    const parsed = getTableSchemaArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      throw new ToolValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const schema = await getTableSchema(context.config.firebird, parsed.data.table_name);

    const response: GetTableSchemaResponse = { schema };

    return toolTextResult(response);
  },
};
