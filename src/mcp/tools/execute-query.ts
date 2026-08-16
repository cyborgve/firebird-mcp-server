import type { McpToolHandler, McpToolResult } from './types';
import { ToolValidationError, ReadOnlyPolicyError } from '../../errors/index';
import { takeAtMost, toolTextResult } from './tool-utils';
import { executeQuery } from '../../db/firebird/firebird-adapter';
import { isReadOnlySql } from './sql-validator';
import { executeQueryArgsSchema } from '../../dtos/tool-schemas';
import type { ExecuteQueryResponse } from '../../dtos/tool-responses';

const TEMPLATE_IDENTIFIER_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const IDENTIFIER_VALUE_PATTERN = /^([A-Za-z_][A-Za-z0-9_$]*)(\.[A-Za-z_][A-Za-z0-9_$]*)*$/;

function applyIdentifierBindings(
  sql: string,
  identifiers: Record<string, string> | undefined,
  allowlist: string[],
): string {
  const placeholders = [...sql.matchAll(TEMPLATE_IDENTIFIER_PATTERN)].map((match) => match[1]);
  const uniquePlaceholders = [...new Set(placeholders)];

  if (uniquePlaceholders.length === 0) {
    return sql;
  }

  if (!identifiers) {
    throw new ToolValidationError(
      'identifiers object is required when SQL contains {{identifier}} templates',
    );
  }

  const allowlistSet = new Set(allowlist);
  for (const placeholder of uniquePlaceholders) {
    if (!placeholder) {
      continue;
    }

    const value = identifiers[placeholder]?.trim();
    if (!value) {
      throw new ToolValidationError(`missing identifier binding for '${placeholder}'`);
    }

    if (!IDENTIFIER_VALUE_PATTERN.test(value)) {
      throw new ToolValidationError(`identifier binding '${placeholder}' has invalid format`);
    }

    if (!allowlistSet.has(value.toUpperCase())) {
      throw new ToolValidationError(`identifier '${value}' is not allowlisted`);
    }
  }

  const rendered = sql.replace(TEMPLATE_IDENTIFIER_PATTERN, (_, name: string) => {
    const value = identifiers[name];
    if (!value) {
      throw new ToolValidationError(`missing identifier binding for '${name}'`);
    }

    return value.trim();
  });

  if (rendered.includes('{{') || rendered.includes('}}')) {
    throw new ToolValidationError('invalid identifier template syntax');
  }

  return rendered;
}

/**
 * Tool handler responsible for executing sanitized, strictly read-only SQL queries against the Firebird database.
 *
 * Enforces rigorous query validation, configurable parameter limits, and robust result set truncation
 * to prevent catastrophic memory consumption and ensure security via read-only enforcement.
 */
export const executeQueryTool: McpToolHandler = {
  definition: {
    name: 'execute_query',
    description: 'Executes SQL query with optional params (safe read-only by default)',
    annotations: {
      readOnlyHint: true,
      idempotentHint: false,
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
        identifiers: {
          type: 'object',
          additionalProperties: {
            type: 'string',
          },
        },
      },
      required: ['sql'],
      additionalProperties: false,
    },
  },

  async execute(args, context): Promise<McpToolResult> {
    const { limits, executeQueryMode, executeQueryAllowedIdentifiers } = context.config;

    const parsed = executeQueryArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      throw new ToolValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const { sql, params: queryParams, identifiers } = parsed.data;
    const renderedSql = applyIdentifierBindings(sql, identifiers, executeQueryAllowedIdentifiers);

    if (executeQueryMode === 'safe' && !isReadOnlySql(renderedSql)) {
      throw new ReadOnlyPolicyError();
    }

    if (queryParams && queryParams.length > limits.executeQueryMaxParams) {
      throw new ToolValidationError(`params exceeds max length ${limits.executeQueryMaxParams}`);
    }

    const mode = executeQueryMode === 'ad-hoc' ? ('ad-hoc' as const) : ('read-only' as const);
    const queryResult = await executeQuery(context.config.firebird, renderedSql, queryParams, mode);
    const limitedRows = takeAtMost(queryResult.rows, limits.executeQueryMaxRows);

    const response: ExecuteQueryResponse = {
      mode,
      rows: limitedRows.values,
      rowCount: limitedRows.values.length,
      truncated: limitedRows.truncated,
      maxRows: limits.executeQueryMaxRows,
      totalRowsBeforeLimit: queryResult.rowCount,
    };

    return toolTextResult(response);
  },
};
