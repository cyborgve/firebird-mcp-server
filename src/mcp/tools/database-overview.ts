import type { McpToolHandler, McpToolResult } from './types';
import { emptyArgsSchema } from '../../dtos/tool-schemas';
import { getDatabaseOverview } from '../../db/firebird/firebird-adapter';
import { ToolValidationError } from '../../errors/index';
import { toolTextResult } from './tool-utils';
import type { DatabaseOverviewResponse } from '../../dtos/tool-responses';

export const databaseOverviewTool: McpToolHandler = {
  definition: {
    name: 'database_overview',
    description: 'Returns high-level Firebird inventory counters and connectivity state',
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

    const overview = await getDatabaseOverview(context.config.firebird);
    const response: DatabaseOverviewResponse = { overview };

    return toolTextResult(response);
  },
};
