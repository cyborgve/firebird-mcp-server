import { describe, expect, test, afterEach } from 'vitest';
import { getPackageInfo, resetPackageInfoCache } from './package-info';

describe('package-info', () => {
  afterEach(() => {
    resetPackageInfoCache();
  });

  test('should return valid name and version', () => {
    const info = getPackageInfo();

    expect(info.name).toBe('firebird-mcp-server');
    expect(typeof info.version).toBe('string');
    expect(info.version.length).toBeGreaterThan(0);
  });

  test('should return cached result on subsequent calls', () => {
    const first = getPackageInfo();
    const second = getPackageInfo();

    expect(first).toBe(second); // Same reference (cached)
  });

  test('should return fresh result after cache reset', () => {
    const first = getPackageInfo();
    resetPackageInfoCache();
    const second = getPackageInfo();

    expect(first).not.toBe(second); // Different reference
    expect(first.name).toBe(second.name); // Same content though
  });

  test('version should match semver-like pattern', () => {
    const info = getPackageInfo();
    // Matches major.minor.patch (optionally with pre-release)
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
