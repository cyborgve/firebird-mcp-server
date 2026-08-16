import type { McpToolHandler, McpToolResult } from './types';
import { emptyArgsSchema } from '../../dtos/tool-schemas';
import { listConstraints } from '../../db/firebird/firebird-adapter';
import { ToolValidationError } from '../../errors/index';
import { toolTextResult } from './tool-utils';
import type { ListConstraintsResponse } from '../../dtos/tool-responses';

export const listConstraintsTool: McpToolHandler = {
  definition: {
    name: 'list_constraints',
    description: 'Lists table constraints (PK, FK, UNIQUE, CHECK, NOT NULL)',
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

    const constraints = await listConstraints(context.config.firebird);
    const response: ListConstraintsResponse = { constraints };

    return toolTextResult(response);
  },
};
