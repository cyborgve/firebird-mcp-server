import type { McpToolHandler, McpToolResult } from './types';
import { emptyArgsSchema } from '../../dtos/tool-schemas';
import { getTableStatistics } from '../../db/firebird/firebird-adapter';
import { ToolValidationError } from '../../errors/index';
import { toolTextResult } from './tool-utils';
import type { TableStatisticsResponse } from '../../dtos/tool-responses';

export const getTableStatisticsTool: McpToolHandler = {
  definition: {
    name: 'get_table_statistics',
    description: 'Returns row count and average record length per user table from MON$TABLE_STATS',
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
    const parsed = emptyArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      throw new ToolValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const statistics = await getTableStatistics(context.config.firebird);
    const response: TableStatisticsResponse = { statistics };

    return toolTextResult(response);
  },
};
