import type { McpToolHandler, McpToolResult } from './types';
import { explainQueryPlanArgsSchema } from '../../dtos/tool-schemas';
import { explainQueryPlan } from '../../db/firebird/firebird-adapter';
import { ToolValidationError, ReadOnlyPolicyError } from '../../errors/index';
import { toolTextResult } from './tool-utils';
import type { ExplainQueryPlanResponse } from '../../dtos/tool-responses';
import { isReadOnlySql } from './sql-validator';

export const explainQueryPlanTool: McpToolHandler = {
  definition: {
    name: 'explain_query_plan',
    description: 'Validates and returns read-only query planning metadata',
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
        },
        params: {
          type: 'array',
          items: {},
        },
      },
      required: ['sql'],
      additionalProperties: false,
    },
  },

  async execute(args, context): Promise<McpToolResult> {
    const parsed = explainQueryPlanArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      throw new ToolValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const { sql } = parsed.data;
    if (!isReadOnlySql(sql)) {
      throw new ReadOnlyPolicyError();
    }

    const plan = explainQueryPlan(context.config.firebird, sql);

    const response: ExplainQueryPlanResponse = { plan };

    return await Promise.resolve(toolTextResult(response));
  },
};
