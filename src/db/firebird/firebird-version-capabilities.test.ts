import { describe, expect, test } from 'vitest';
import {
  getCapabilitiesForEngineVersion,
  getSupportedVersionRange,
  getVersionFamilyFromEngineVersion,
} from './firebird-version-capabilities';

describe('firebird-version-capabilities', () => {
  test('should resolve known families from engine version', () => {
    expect(getVersionFamilyFromEngineVersion('2.5.9')).toBe('2.5');
    expect(getVersionFamilyFromEngineVersion('3.0.11')).toBe('3.x');
    expect(getVersionFamilyFromEngineVersion('4.0.4')).toBe('4.x');
    expect(getVersionFamilyFromEngineVersion('5.0.1')).toBe('5.x');
  });

  test('should return unknown family for empty or unsupported versions', () => {
    expect(getVersionFamilyFromEngineVersion('')).toBe('unknown');
    expect(getVersionFamilyFromEngineVersion('6.0.0')).toBe('unknown');
  });

  test('should return conservative defaults for unknown capabilities', () => {
    const capabilities = getCapabilitiesForEngineVersion(undefined);

    expect(capabilities.family).toBe('unknown');
    expect(capabilities.supportsReadOnlyTransactions).toBe(true);
    expect(capabilities.supportsWireEncryptionNegotiation).toBe(false);
  });

  test('should return expected profile for firebird 4.x', () => {
    const capabilities = getCapabilitiesForEngineVersion('4.0.4');

    expect(capabilities.family).toBe('4.x');
    expect(capabilities.supportsSrp256Auth).toBe(true);
    expect(capabilities.supportsDecfloat).toBe(true);
    expect(capabilities.recommendedAuthMode).toBe('srp256');
  });

  test('should expose support range from 2.5 to 5.x', () => {
    const range = getSupportedVersionRange();

    expect(range.minimum).toBe('2.5');
    expect(range.targetCurrent).toBe('5.x');
  });
});
