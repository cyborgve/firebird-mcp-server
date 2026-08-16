import type { McpToolHandler, McpToolResult } from './types';
import { backupDatabaseArgsSchema } from '../../dtos/tool-schemas';
import { runBackup } from '../../db/firebird/firebird-adapter';
import { ToolValidationError } from '../../errors/index';
import { toolTextResult } from './tool-utils';
import type { BackupDatabaseResponse } from '../../dtos/tool-responses';

export const backupDatabaseTool: McpToolHandler = {
  definition: {
    name: 'backup_database',
    description: 'Runs gbak backup for the configured Firebird database',
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: false,
      destructiveHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        backup_path: {
          type: 'string',
        },
        verbose: {
          type: 'boolean',
        },
      },
      required: ['backup_path'],
      additionalProperties: false,
    },
  },

  async execute(args, context): Promise<McpToolResult> {
    const parsed = backupDatabaseArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      throw new ToolValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const { backup_path, verbose } = parsed.data;
    const result = await Promise.resolve(
      runBackup(
        context.config.firebird,
        backup_path,
        verbose !== undefined ? { verbose } : undefined,
      ),
    );
    const response: BackupDatabaseResponse = result;

    return toolTextResult(response);
  },
};
