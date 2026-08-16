import type { McpToolHandler, McpToolResult } from './types';
import { emptyArgsSchema } from '../../dtos/tool-schemas';
import { getIndexUsage } from '../../db/firebird/firebird-adapter';
import { ToolValidationError } from '../../errors/index';
import { toolTextResult } from './tool-utils';
import type { AnalyzeIndexUsageResponse } from '../../dtos/tool-responses';

export const analyzeIndexUsageTool: McpToolHandler = {
  definition: {
    name: 'analyze_index_usage',
    description: 'Analyzes index read activity and assigns a usage score (high/medium/low/unused)',
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

    const indexes = await getIndexUsage(context.config.firebird);
    const response: AnalyzeIndexUsageResponse = { indexes };

    return toolTextResult(response);
  },
};
