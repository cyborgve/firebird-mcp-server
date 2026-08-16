import { describe, expect, test } from 'vitest';
import { getTableSchemaTool } from '../get-table-schema';
import { executeQueryTool } from '../execute-query';
import { pingTool } from '../ping';
import { serverStatusTool } from '../server-status';
import { listTablesTool } from '../list-tables';
import { getDatabaseSchemaTool } from '../get-database-schema';
import { explainQueryPlanTool } from '../explain-query-plan';
import { listIndexesTool } from '../list-indexes';
import { listConstraintsTool } from '../list-constraints';
import { databaseOverviewTool } from '../database-overview';
import { ToolValidationError, ReadOnlyPolicyError } from '../../../errors/index';
import type { McpToolContext } from '../types';

const testContext: McpToolContext = {
  config: {
    mcpTransport: 'stdio',
    firebird: {
      host: '127.0.0.1',
      port: 3050,
      database: '',
      user: 'SYSDBA',
      password: 'masterkey',
      charset: 'UTF8',
    },
    executeQueryMode: 'safe',
    executeQueryAllowedIdentifiers: ['USERS', 'PUBLIC.USERS', 'ORDERS'],
    readOnly: false,
    toolsets: [],
    toolsReloadEnabled: false,
    toolTimeoutOverrides: {},
    firebirdVersionFamilyOverride: undefined,
    telemetry: {
      enabled: false,
      exporter: 'logs',
      maxStoredSpans: 200,
    },
    limits: {
      timeoutMs: 2000,
      listTablesMaxItems: 500,
      schemaMaxTables: 200,
      schemaMaxColumnsPerTable: 300,
      executeQueryMaxRows: 200,
      executeQueryMaxParams: 3,
      toolsPageSize: 50,
    },
    http: {
      host: '127.0.0.1',
      port: 3000,
      path: '/mcp',
      maxRequestBodyBytes: 1024 * 1024,
      allowedOrigins: [],
      requireAuthentication: false,
      enforceProtocolVersionHeader: true,
    },
  },
};

function parseJsonObject(text: string | undefined): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text ?? '{}');
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
}

describe('tool handler definitions', () => {
  test('all tools should have valid definitions', () => {
    const tools = [
      pingTool,
      serverStatusTool,
      listTablesTool,
      getTableSchemaTool,
      getDatabaseSchemaTool,
      executeQueryTool,
      explainQueryPlanTool,
      listIndexesTool,
      listConstraintsTool,
      databaseOverviewTool,
    ];

    for (const tool of tools) {
      expect(tool.definition.name).toBeTruthy();
      expect(tool.definition.description).toBeTruthy();
      expect(tool.definition.inputSchema.type).toBe('object');
      expect(tool.definition.inputSchema.additionalProperties).toBe(false);
    }
  });

  test('all tool names should be unique', () => {
    const tools = [
      pingTool,
      serverStatusTool,
      listTablesTool,
      getTableSchemaTool,
      getDatabaseSchemaTool,
      executeQueryTool,
      explainQueryPlanTool,
      listIndexesTool,
      listConstraintsTool,
      databaseOverviewTool,
    ];
    const names = tools.map((t) => t.definition.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('get_table_schema validation', () => {
  test('should throw ToolValidationError when table_name is missing', async () => {
    await expect(getTableSchemaTool.execute({}, testContext)).rejects.toThrow(ToolValidationError);
  });

  test('should throw ToolValidationError when table_name is empty string', async () => {
    await expect(getTableSchemaTool.execute({ table_name: '' }, testContext)).rejects.toThrow(
      ToolValidationError,
    );
  });

  test('should throw ToolValidationError when table_name is not a string', async () => {
    await expect(getTableSchemaTool.execute({ table_name: 123 }, testContext)).rejects.toThrow(
      ToolValidationError,
    );
  });

  test('should throw ToolValidationError when args is undefined', async () => {
    await expect(getTableSchemaTool.execute(undefined, testContext)).rejects.toThrow(
      ToolValidationError,
    );
  });

  test('should return null schema for non-existent table when no db configured', async () => {
    const result = await getTableSchemaTool.execute({ table_name: 'NON_EXISTENT' }, testContext);

    expect(result.content[0]?.type).toBe('text');
    const parsed = parseJsonObject(result.content[0]?.text);
    expect(parsed['schema']).toBeNull();
  });
});

describe('execute_query validation', () => {
  test('should throw ToolValidationError when sql is missing', async () => {
    await expect(executeQueryTool.execute({}, testContext)).rejects.toThrow(ToolValidationError);
  });

  test('should throw ToolValidationError when sql is empty string', async () => {
    await expect(executeQueryTool.execute({ sql: '' }, testContext)).rejects.toThrow(
      ToolValidationError,
    );
  });

  test('should throw ToolValidationError when sql is not a string', async () => {
    await expect(executeQueryTool.execute({ sql: 42 }, testContext)).rejects.toThrow(
      ToolValidationError,
    );
  });

  test('should throw ReadOnlyPolicyError for UPDATE statement', async () => {
    await expect(
      executeQueryTool.execute({ sql: "UPDATE users SET name = 'x'" }, testContext),
    ).rejects.toThrow(ReadOnlyPolicyError);
  });

  test('should throw ReadOnlyPolicyError for DELETE statement', async () => {
    await expect(
      executeQueryTool.execute({ sql: 'DELETE FROM users' }, testContext),
    ).rejects.toThrow(ReadOnlyPolicyError);
  });

  test('should throw ReadOnlyPolicyError for INSERT statement', async () => {
    await expect(
      executeQueryTool.execute({ sql: "INSERT INTO users VALUES ('x')" }, testContext),
    ).rejects.toThrow(ReadOnlyPolicyError);
  });

  test('should throw ToolValidationError when params exceed max length', async () => {
    await expect(
      executeQueryTool.execute(
        {
          sql: 'SELECT * FROM users WHERE a = ? AND b = ? AND c = ? AND d = ?',
          params: [1, 2, 3, 4],
        },
        testContext,
      ),
    ).rejects.toThrow(ToolValidationError);
  });

  test('should throw ToolValidationError when params contain object values', async () => {
    await expect(
      executeQueryTool.execute(
        {
          sql: 'SELECT * FROM users WHERE id = ?',
          params: [{ id: 1 }],
        },
        testContext,
      ),
    ).rejects.toThrow(ToolValidationError);
  });

  test('should throw ToolValidationError when params contain non-finite numbers', async () => {
    await expect(
      executeQueryTool.execute(
        {
          sql: 'SELECT * FROM users WHERE id = ?',
          params: [Number.POSITIVE_INFINITY],
        },
        testContext,
      ),
    ).rejects.toThrow(ToolValidationError);
  });

  test('should throw ToolValidationError when params contain too-long string values', async () => {
    await expect(
      executeQueryTool.execute(
        {
          sql: 'SELECT * FROM users WHERE name = ?',
          params: ['x'.repeat(4001)],
        },
        testContext,
      ),
    ).rejects.toThrow(ToolValidationError);
  });

  test('should throw ToolValidationError when SQL template bindings are missing', async () => {
    await expect(
      executeQueryTool.execute(
        {
          sql: 'SELECT * FROM {{table_name}}',
        },
        testContext,
      ),
    ).rejects.toThrow(ToolValidationError);
  });

  test('should throw ToolValidationError when identifier is not allowlisted', async () => {
    await expect(
      executeQueryTool.execute(
        {
          sql: 'SELECT * FROM {{table_name}}',
          identifiers: {
            table_name: 'SYSDBA.USERS',
          },
        },
        testContext,
      ),
    ).rejects.toThrow(ToolValidationError);
  });

  test('should throw ToolValidationError when identifier format is invalid', async () => {
    await expect(
      executeQueryTool.execute(
        {
          sql: 'SELECT * FROM {{table_name}}',
          identifiers: {
            table_name: 'users; DROP TABLE users',
          },
        },
        testContext,
      ),
    ).rejects.toThrow(ToolValidationError);
  });

  test('should allow allowlisted SQL template identifier substitutions', async () => {
    const result = await executeQueryTool.execute(
      {
        sql: 'SELECT * FROM {{table_name}}',
        identifiers: {
          table_name: 'users',
        },
      },
      testContext,
    );

    expect(result.content[0]?.type).toBe('text');
    const parsed = parseJsonObject(result.content[0]?.text);
    expect(parsed['mode']).toBe('read-only');
    expect(parsed['rows']).toEqual([]);
  });

  test('should return empty result for valid SELECT when no db configured', async () => {
    const result = await executeQueryTool.execute({ sql: 'SELECT 1' }, testContext);

    expect(result.content[0]?.type).toBe('text');
    const parsed = parseJsonObject(result.content[0]?.text);
    expect(parsed['mode']).toBe('read-only');
    expect(parsed['rows']).toEqual([]);
    expect(parsed['rowCount']).toBe(0);
  });

  test('should accept valid params array', async () => {
    const result = await executeQueryTool.execute(
      { sql: 'SELECT * FROM users WHERE id = ?', params: [1] },
      testContext,
    );

    expect(result.content[0]?.type).toBe('text');
    const parsed = parseJsonObject(result.content[0]?.text);
    expect(parsed['mode']).toBe('read-only');
  });

  test('should allow ad-hoc SQL mode when explicitly enabled', async () => {
    const adHocContext: McpToolContext = {
      config: {
        ...testContext.config,
        executeQueryMode: 'ad-hoc',
      },
    };

    const result = await executeQueryTool.execute(
      { sql: "UPDATE users SET name = 'x'" },
      adHocContext,
    );

    expect(result.content[0]?.type).toBe('text');
    const parsed = parseJsonObject(result.content[0]?.text);
    expect(parsed['mode']).toBe('ad-hoc');
    expect(parsed['rows']).toEqual([]);
    expect(parsed['rowCount']).toBe(0);
  });
});

describe('ping tool', () => {
  test('should return degraded status when no db configured', async () => {
    const result = await pingTool.execute(undefined, testContext);

    expect(result.content[0]?.type).toBe('text');
    const parsed = parseJsonObject(result.content[0]?.text);
    expect(parsed['status']).toBe('degraded');
    expect(parsed['server']).toBe('firebird-mcp-server');
    expect(parsed['transport']).toBe('stdio');
    expect(parsed['firebirdConnected']).toBe(false);
  });
});

describe('list_tables tool', () => {
  test('should return empty tables when no db configured', async () => {
    const result = await listTablesTool.execute(undefined, testContext);

    expect(result.content[0]?.type).toBe('text');
    const parsed = parseJsonObject(result.content[0]?.text);
    expect(parsed['tables']).toEqual([]);
    expect(parsed['truncated']).toBe(false);
  });
});

describe('get_database_schema tool', () => {
  test('should return empty schema when no db configured', async () => {
    const result = await getDatabaseSchemaTool.execute(undefined, testContext);

    expect(result.content[0]?.type).toBe('text');
    const parsed = parseJsonObject(result.content[0]?.text);
    expect(parsed['schema']).toEqual([]);
    expect(parsed['truncated']).toBe(false);
  });
});

describe('list_indexes tool', () => {
  test('should return empty indexes when no db configured', async () => {
    const result = await listIndexesTool.execute(undefined, testContext);

    expect(result.content[0]?.type).toBe('text');
    const parsed = parseJsonObject(result.content[0]?.text);
    expect(parsed['indexes']).toEqual([]);
  });
});

describe('list_constraints tool', () => {
  test('should return empty constraints when no db configured', async () => {
    const result = await listConstraintsTool.execute(undefined, testContext);

    expect(result.content[0]?.type).toBe('text');
    const parsed = parseJsonObject(result.content[0]?.text);
    expect(parsed['constraints']).toEqual([]);
  });
});

describe('database_overview tool', () => {
  test('should return disconnected overview when no db configured', async () => {
    const result = await databaseOverviewTool.execute(undefined, testContext);

    expect(result.content[0]?.type).toBe('text');
    const parsed = parseJsonObject(result.content[0]?.text);
    const overview = parsed['overview'] as Record<string, unknown>;
    expect(overview['configured']).toBe(false);
    expect(overview['connected']).toBe(false);
    expect(overview['tableCount']).toBe(0);
    expect(overview['indexCount']).toBe(0);
    expect(overview['constraintCount']).toBe(0);
  });
});

describe('explain_query_plan tool', () => {
  test('should reject non-read-only explain requests', async () => {
    await expect(
      explainQueryPlanTool.execute({ sql: 'DELETE FROM USERS' }, testContext),
    ).rejects.toThrow(ReadOnlyPolicyError);
  });

  test('should return heuristic explain payload for read-only SQL', async () => {
    const result = await explainQueryPlanTool.execute(
      { sql: 'SELECT 1 FROM RDB$DATABASE' },
      testContext,
    );

    expect(result.content[0]?.type).toBe('text');
    const parsed = parseJsonObject(result.content[0]?.text);
    const plan = parsed['plan'] as Record<string, unknown>;
    expect(plan['planner']).toBe('heuristic');
    expect(plan['readOnly']).toBe(true);
    expect(plan['explainable']).toBe(true);
    expect(Array.isArray(plan['referencedTables'])).toBe(true);
    expect(plan['hasJoins']).toBe(false);
    expect(plan['hasSubqueries']).toBe(false);
    expect(plan['estimatedComplexity']).toBe('low');
  });

  test('should report medium complexity and joins for join queries', async () => {
    const result = await explainQueryPlanTool.execute(
      { sql: 'SELECT * FROM USERS U JOIN ORDERS O ON O.USER_ID = U.ID' },
      testContext,
    );

    const parsed = parseJsonObject(result.content[0]?.text);
    const plan = parsed['plan'] as Record<string, unknown>;
    const referencedTables = plan['referencedTables'] as string[];

    expect(plan['hasJoins']).toBe(true);
    expect(plan['hasSubqueries']).toBe(false);
    expect(plan['estimatedComplexity']).toBe('medium');
    expect(referencedTables).toEqual(expect.arrayContaining(['USERS', 'ORDERS']));
  });
});
