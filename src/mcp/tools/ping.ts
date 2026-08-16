import type { McpToolHandler, McpToolResult } from './types';
import { toolTextResult } from './tool-utils';
import { pingFirebird, getFirebirdHealth } from '../../db/firebird/firebird-adapter';
import { getPackageInfo } from '../../config/package-info';
import { emptyArgsSchema } from '../../dtos/tool-schemas';
import { ToolValidationError } from '../../errors/index';
import type { PingResponse } from '../../dtos/tool-responses';

/**
 * Tool handler executing a comprehensive connectivity evaluation against the configured database.
 *
 * Bypasses intensive operations in favor of lightweight protocol-level handshakes to verify latency,
 * authentication status, and basic network availability.
 */
export const pingTool: McpToolHandler = {
  definition: {
    name: 'ping',
    description: 'Checks MCP server and Firebird adapter reachability',
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

    const ping = await pingFirebird(context.config.firebird);

    const response: PingResponse = {
      status: ping.connected ? 'ok' : 'degraded',
      server: getPackageInfo().name,
      transport: context.config.mcpTransport,
      firebirdConfigured: getFirebirdHealth(context.config.firebird).configured,
      firebirdConnected: ping.connected,
      latencyMs: ping.latencyMs,
      ...(ping.engineVersion !== undefined ? { engineVersion: ping.engineVersion } : {}),
      ...(ping.error !== undefined ? { error: ping.error } : {}),
    };

    return toolTextResult(response);
  },
};
