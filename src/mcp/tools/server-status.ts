import type { McpToolHandler, McpToolResult } from './types';
import { toolTextResult } from './tool-utils';
import { getFirebirdRuntimeStatus } from '../../db/firebird/firebird-adapter';
import { emptyArgsSchema } from '../../dtos/tool-schemas';
import { ToolValidationError } from '../../errors/index';
import type { ServerStatusResponse } from '../../dtos/tool-responses';

/**
 * Tool handler dedicated to providing a deep diagnostic snapshot of the server's runtime environment.
 *
 * Aggregates framework transport telemetry with intrinsic database compatibility profiling, returning
 * a complete picture of operational health.
 */
export const serverStatusTool: McpToolHandler = {
  definition: {
    name: 'server_status',
    description: 'Returns runtime and Firebird compatibility status',
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

    const firebird = await getFirebirdRuntimeStatus(context.config.firebird);

    const response: ServerStatusResponse = {
      server: 'ok',
      transport: context.config.mcpTransport,
      firebird,
    };

    return toolTextResult(response);
  },
};
