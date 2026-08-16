import { describe, expect, test, vi, beforeEach } from 'vitest';
import firebird from 'node-firebird';
import type { FirebirdConfig } from '../../config/env-config.js';
import type { FirebirdVersionCapabilities } from './firebird-version-capabilities.js';

const v4Caps: FirebirdVersionCapabilities = {
  family: '4.x',
  supportsWireEncryptionNegotiation: true,
  supportsSrpAuth: true,
  supportsSrp256Auth: true,
  supportsBooleanType: true,
  supportsDecfloat: true,
  supportsTimeZoneTypes: true,
  supportsReadOnlyTransactions: true,
  supportsNativeExplainPlan: true,
  recommendedAuthMode: 'srp256',
  notes: [],
};

vi.mock('node-firebird', () => ({
  default: {
    attach: vi.fn(),
  },
}));

const baseConfig: FirebirdConfig = {
  host: '127.0.0.1',
  port: 3050,
  database: 'test.fdb',
  user: 'SYSDBA',
  password: 'masterkey',
  charset: 'UTF8',
};

const emptyConfig: FirebirdConfig = {
  host: '127.0.0.1',
  port: 3050,
  database: '',
  user: 'SYSDBA',
  password: '',
  charset: 'UTF8',
};

describe('firebird-adapter', () => {
  let adapter: typeof import('./firebird-adapter.js');
  let attachMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetAllMocks();
    attachMock = vi.mocked(firebird.attach);
    vi.resetModules();
    adapter = await import('./firebird-adapter.js');
  });

  describe('getFirebirdHealth', () => {
    test('should return configured=false when database is empty', () => {
      const health = adapter.getFirebirdHealth(emptyConfig);
      expect(health.configured).toBe(false);
      expect(health.database).toBe('');
    });

    test('should return configured=true when database is set', () => {
      const health = adapter.getFirebirdHealth(baseConfig);
      expect(health.configured).toBe(true);
      expect(health.host).toBe('127.0.0.1');
      expect(health.port).toBe(3050);
    });

    test('should include supported version range', () => {
      const health = adapter.getFirebirdHealth(baseConfig);
      expect(health.supportedRange).toEqual({ minimum: '2.5', targetCurrent: '5.x' });
    });
  });

  describe('pingFirebird', () => {
    test('should return not connected when database is not configured', async () => {
      const result = await adapter.pingFirebird(emptyConfig);
      expect(result.connected).toBe(false);
      expect(result.error).toContain('FIREBIRD_DATABASE');
    });

    test('should return connected=true when attach succeeds', async () => {
      const mockDb = {
        query: vi.fn((_sql: string, cb: (e: null, r: unknown[]) => void) =>
          cb(null, [{ ENGINE_VERSION: '4.0.1' }]),
        ),
      };
      attachMock.mockImplementation((_opts: unknown, cb: (e: Error | null, db: unknown) => void) =>
        cb(null, mockDb),
      );

      const result = await adapter.pingFirebird(baseConfig);
      expect(result.connected).toBe(true);
      expect(result.engineVersion).toBe('4.0.1');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    test('should still report connected on engine version fetch failure', async () => {
      const queryDb = {
        query: vi.fn((_sql: string, c: (e: Error) => void) => c(new Error('query failed'))),
      };
      attachMock.mockImplementation((_opts: unknown, cb: (e: Error | null, db: unknown) => void) =>
        cb(null, queryDb),
      );

      const result = await adapter.pingFirebird(baseConfig);
      expect(result.connected).toBe(true);
      expect(result.engineVersion).toBeUndefined();
    });
  });

  describe('listTables', () => {
    test('should return empty array when database is not configured', async () => {
      const tables = await adapter.listTables(emptyConfig);
      expect(tables).toEqual([]);
    });

    test('should return table names from query', async () => {
      const mockDb = {
        query: vi.fn((_sql: string, cb: (e: null, r: unknown[]) => void) =>
          cb(null, [{ TABLE_NAME: 'CUSTOMERS' }, { TABLE_NAME: 'ORDERS' }]),
        ),
      };
      attachMock.mockImplementation((_opts: unknown, cb: (e: Error | null, db: unknown) => void) =>
        cb(null, mockDb),
      );

      const tables = await adapter.listTables(baseConfig);
      expect(tables).toEqual(['CUSTOMERS', 'ORDERS']);
    });
  });

  describe('getTableSchema', () => {
    test('should return null for unconfigured database', async () => {
      const schema = await adapter.getTableSchema(emptyConfig, 'CUSTOMERS');
      expect(schema).toBeNull();
    });

    test('should return table schema with columns', async () => {
      const mockDb = {
        query: vi.fn((_sql: string, _params: unknown[], cb: (e: null, r: unknown[]) => void) =>
          cb(null, [
            { COLUMN_NAME: 'ID', FIELD_TYPE: 8, NULL_FLAG: 1 },
            {
              COLUMN_NAME: 'NAME',
              FIELD_TYPE: 37,
              FIELD_SUB_TYPE: 0,
              FIELD_LENGTH: 100,
              NULL_FLAG: null,
            },
          ]),
        ),
      };
      attachMock.mockImplementation((_opts: unknown, cb: (e: Error | null, db: unknown) => void) =>
        cb(null, mockDb),
      );

      const schema = await adapter.getTableSchema(baseConfig, 'CUSTOMERS');
      expect(schema).not.toBeNull();
      expect(schema!.table).toBe('CUSTOMERS');
      expect(schema!.columns).toHaveLength(2);
      expect(schema!.columns[0]?.name).toBe('ID');
      expect(schema!.columns[0]?.type).toBe('INTEGER');
      expect(schema!.columns[1]?.name).toBe('NAME');
      expect(schema!.columns[1]?.type).toBe('VARCHAR(100)');
    });
  });

  describe('getDatabaseSchema cache', () => {
    test('should cache schema results and return cached on second call', async () => {
      let queryCallCount = 0;
      const mockDb = {
        query: vi.fn((_sql: string, cb: (e: null, r: unknown[]) => void) => {
          queryCallCount += 1;
          cb(null, [{ TABLE_NAME: 'CUSTOMERS', COLUMN_NAME: 'ID', FIELD_TYPE: 8, NULL_FLAG: 1 }]);
        }),
      };
      attachMock.mockImplementation((_opts: unknown, cb: (e: Error | null, db: unknown) => void) =>
        cb(null, mockDb),
      );

      const first = await adapter.getDatabaseSchema(baseConfig);
      expect(first).toHaveLength(1);
      expect(queryCallCount).toBe(1);

      const second = await adapter.getDatabaseSchema(baseConfig);
      expect(second).toHaveLength(1);
      expect(queryCallCount).toBe(1);
    });
  });

  describe('executeQuery', () => {
    test('should return empty result for unconfigured database', async () => {
      const result = await adapter.executeQuery(emptyConfig, 'SELECT 1', [], 'read-only');
      expect(result.mode).toBe('read-only');
      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });

    test('should return rows for valid query', async () => {
      const mockDb = {
        query: vi.fn((_sql: string, cb: (e: null, r: unknown[]) => void) =>
          cb(null, [{ ID: 1, NAME: 'Test' }]),
        ),
      };
      attachMock.mockImplementation((_opts: unknown, cb: (e: Error | null, db: unknown) => void) =>
        cb(null, mockDb),
      );

      const result = await adapter.executeQuery(baseConfig, 'SELECT * FROM TEST');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.NAME).toBe('Test');
    });
  });

  describe('explainQueryPlan', () => {
    test('should return heuristic plan for simple SELECT', () => {
      const plan = adapter.explainQueryPlan(baseConfig, 'SELECT * FROM CUSTOMERS');
      expect(plan.planner).toBe('heuristic');
      expect(plan.referencedTables).toContain('CUSTOMERS');
      expect(plan.estimatedComplexity).toBe('low');
    });

    test('should detect joins', () => {
      const plan = adapter.explainQueryPlan(
        baseConfig,
        'SELECT c.* FROM CUSTOMERS c JOIN ORDERS o ON c.ID = o.CUSTOMER_ID',
      );
      expect(plan.hasJoins).toBe(true);
      expect(plan.estimatedComplexity).toBe('medium');
    });

    test('should return nativeCapable when caps indicate v4+', () => {
      const plan = adapter.explainQueryPlan(baseConfig, 'SELECT 1', v4Caps);
      expect(plan.nativeCapable).toBe(true);
    });

    test('should return unconfigured warning', () => {
      const plan = adapter.explainQueryPlan(emptyConfig, 'SELECT 1');
      expect(plan.warnings).toContain('FIREBIRD_DATABASE is not configured');
    });
  });

  describe('listIndexes', () => {
    test('should return empty for unconfigured database', async () => {
      const indexes = await adapter.listIndexes(emptyConfig);
      expect(indexes).toEqual([]);
    });

    test('should group index segments', async () => {
      const mockDb = {
        query: vi.fn((_sql: string, cb: (e: null, r: unknown[]) => void) =>
          cb(null, [
            {
              TABLE_NAME: 'CUSTOMERS',
              INDEX_NAME: 'PK_CUSTOMERS',
              UNIQUE_FLAG: 1,
              INDEX_INACTIVE: 0,
              INDEX_TYPE: 0,
              EXPRESSION_SOURCE: null,
              COLUMN_NAME: 'ID',
              FIELD_POSITION: 0,
            },
          ]),
        ),
      };
      attachMock.mockImplementation((_opts: unknown, cb: (e: Error | null, db: unknown) => void) =>
        cb(null, mockDb),
      );

      const indexes = await adapter.listIndexes(baseConfig);
      expect(indexes).toHaveLength(1);
      expect(indexes[0]?.unique).toBe(true);
    });
  });

  describe('listConstraints', () => {
    test('should return empty for unconfigured database', async () => {
      const constraints = await adapter.listConstraints(emptyConfig);
      expect(constraints).toEqual([]);
    });

    test('should return constraints', async () => {
      const mockDb = {
        query: vi.fn((_sql: string, cb: (e: null, r: unknown[]) => void) =>
          cb(null, [
            {
              TABLE_NAME: 'CUSTOMERS',
              CONSTRAINT_NAME: 'PK_CUSTOMERS',
              CONSTRAINT_TYPE: 'PRIMARY KEY',
              INDEX_NAME: 'PK_CUSTOMERS',
            },
          ]),
        ),
      };
      attachMock.mockImplementation((_opts: unknown, cb: (e: Error | null, db: unknown) => void) =>
        cb(null, mockDb),
      );

      const constraints = await adapter.listConstraints(baseConfig);
      expect(constraints).toHaveLength(1);
      expect(constraints[0]?.type).toBe('PRIMARY KEY');
    });
  });

  describe('pool limits', () => {
    test('should reject if total connections exceed POOL_MAX_TOTAL', async () => {
      attachMock.mockImplementation(
        (_opts: unknown, cb: (e: Error | null, db: unknown) => void) => {
          cb(null, { query: vi.fn((_s: string, c: (e: null) => void) => c(null)) });
        },
      );

      const freshAdapter = await import('./firebird-adapter.js');

      const configs = Array.from({ length: 22 }, (_, i) => ({
        ...baseConfig,
        database: `pool-test-${i}.fdb`,
      }));

      const results = await Promise.allSettled(configs.map((cfg) => freshAdapter.listTables(cfg)));

      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected.length).toBeGreaterThanOrEqual(1);
    });
  });
});
