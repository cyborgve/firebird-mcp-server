import type { FirebirdTableSchema } from './firebird/firebird-adapter';

interface CacheEntry {
  data: FirebirdTableSchema[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 60_000;

export function getCachedSchema(key: string): FirebirdTableSchema[] | undefined {
  const entry = cache.get(key);
  if (!entry) {
    return undefined;
  }

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }

  return entry.data;
}

export function setCachedSchema(key: string, data: FirebirdTableSchema[], ttlMs?: number): void {
  cache.set(key, {
    data,
    expiresAt: Date.now() + (ttlMs ?? DEFAULT_TTL_MS),
  });
}

export function invalidateSchemaCache(key: string): void {
  cache.delete(key);
}

export function clearAllSchemaCaches(): void {
  cache.clear();
}

export function schemaCacheKey(
  configHost: string,
  configPort: number,
  configDatabase: string,
): string {
  return `${configHost}:${configPort}/${configDatabase}`;
}
