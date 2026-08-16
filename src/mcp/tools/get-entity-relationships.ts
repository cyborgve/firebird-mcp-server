import type { McpToolHandler, McpToolResult } from './types';
import { emptyArgsSchema } from '../../dtos/tool-schemas';
import { getEntityRelationships } from '../../db/firebird/firebird-adapter';
import { ToolValidationError } from '../../errors/index';
import { toolTextResult } from './tool-utils';
import type { EntityRelationshipsResponse } from '../../dtos/tool-responses';

export const getEntityRelationshipsTool: McpToolHandler = {
  definition: {
    name: 'get_entity_relationships',
    description: 'Lists foreign key relationships between user tables',
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

    const relationships = await getEntityRelationships(context.config.firebird);
    const response: EntityRelationshipsResponse = { relationships };

    return toolTextResult(response);
  },
};
