import { describe, expect, test, beforeEach } from 'vitest';
import {
  getCachedSchema,
  setCachedSchema,
  invalidateSchemaCache,
  clearAllSchemaCaches,
  schemaCacheKey,
} from './schema-cache';
import type { FirebirdTableSchema } from './firebird/firebird-adapter';

const sampleSchema: FirebirdTableSchema[] = [
  { table: 'CUSTOMERS', columns: [{ name: 'ID', type: 'INTEGER', nullable: false }] },
  { table: 'ORDERS', columns: [{ name: 'ID', type: 'INTEGER', nullable: false }] },
];

describe('schema-cache', () => {
  beforeEach(() => {
    clearAllSchemaCaches();
  });

  test('should return undefined for uncached key', () => {
    const result = getCachedSchema('nonexistent');
    expect(result).toBeUndefined();
  });

  test('should return cached data for valid key', () => {
    setCachedSchema('test-key', sampleSchema);
    const result = getCachedSchema('test-key');
    expect(result).toEqual(sampleSchema);
  });

  test('should expire entry after TTL', async () => {
    setCachedSchema('expire-key', sampleSchema, 10); // 10ms TTL
    expect(getCachedSchema('expire-key')).toEqual(sampleSchema);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getCachedSchema('expire-key')).toBeUndefined();
  });

  test('should invalidate specific key', () => {
    setCachedSchema('key-a', sampleSchema);
    setCachedSchema('key-b', sampleSchema);
    invalidateSchemaCache('key-a');

    expect(getCachedSchema('key-a')).toBeUndefined();
    expect(getCachedSchema('key-b')).toEqual(sampleSchema);
  });

  test('should clear all entries', () => {
    setCachedSchema('key-a', sampleSchema);
    setCachedSchema('key-b', sampleSchema);
    clearAllSchemaCaches();

    expect(getCachedSchema('key-a')).toBeUndefined();
    expect(getCachedSchema('key-b')).toBeUndefined();
  });

  test('schemaCacheKey should produce deterministic keys', () => {
    const key1 = schemaCacheKey('127.0.0.1', 3050, '/db/test.fdb');
    const key2 = schemaCacheKey('127.0.0.1', 3050, '/db/test.fdb');
    const key3 = schemaCacheKey('localhost', 3050, '/db/test.fdb');

    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key1).toContain('127.0.0.1');
    expect(key1).toContain('3050');
  });
});
