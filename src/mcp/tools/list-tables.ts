import type { McpToolHandler, McpToolResult } from './types';
import { takeAtMost, toolTextResult } from './tool-utils';
import { listTables } from '../../db/firebird/firebird-adapter';
import { emptyArgsSchema } from '../../dtos/tool-schemas';
import { ToolValidationError } from '../../errors/index';
import type { ListTablesResponse } from '../../dtos/tool-responses';

/**
 * Tool handler that compiles an indexed inventory of all non-system user tables accessible to the current connection.
 *
 * Enforces mandatory pagination via truncation limits configured at the server level to guarantee steady payload sizes.
 */
export const listTablesTool: McpToolHandler = {
  definition: {
    name: 'list_tables',
    description: 'Lists user tables available in current Firebird database',
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

    const tables = await listTables(context.config.firebird);
    const limitedTables = takeAtMost(tables, context.config.limits.listTablesMaxItems);

    const response: ListTablesResponse = {
      tables: limitedTables.values,
      truncated: limitedTables.truncated,
      maxItems: context.config.limits.listTablesMaxItems,
    };

    return toolTextResult(response);
  },
};
