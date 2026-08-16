import type { McpToolHandler, McpToolResult } from './types';
import { emptyArgsSchema } from '../../dtos/tool-schemas';
import { listIndexes } from '../../db/firebird/firebird-adapter';
import { ToolValidationError } from '../../errors/index';
import { toolTextResult } from './tool-utils';
import type { ListIndexesResponse } from '../../dtos/tool-responses';

export const listIndexesTool: McpToolHandler = {
  definition: {
    name: 'list_indexes',
    description: 'Lists user-table indexes with key metadata',
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

    const indexes = await listIndexes(context.config.firebird);
    const response: ListIndexesResponse = { indexes };

    return toolTextResult(response);
  },
};
