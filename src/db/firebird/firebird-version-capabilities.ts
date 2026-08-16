/**
 * Defines the broadly categorized generational families for Firebird engine versions.
 */
export type FirebirdVersionFamily = '2.5' | '3.x' | '4.x' | '5.x' | 'unknown';

/**
 * Describes the deterministic structural and behavioral capabilities inherently supported by a specific Firebird version family.
 */
export interface FirebirdVersionCapabilities {
  family: FirebirdVersionFamily;
  supportsWireEncryptionNegotiation: boolean;
  supportsSrpAuth: boolean;
  supportsSrp256Auth: boolean;
  supportsBooleanType: boolean;
  supportsDecfloat: boolean;
  supportsTimeZoneTypes: boolean;
  supportsReadOnlyTransactions: boolean;
  supportsNativeExplainPlan: boolean;
  recommendedAuthMode: 'legacy' | 'srp' | 'srp256' | 'mixed';
  notes: string[];
}

const VERSION_CAPABILITY_MATRIX: Record<
  Exclude<FirebirdVersionFamily, 'unknown'>,
  FirebirdVersionCapabilities
> = {
  '2.5': {
    family: '2.5',
    supportsWireEncryptionNegotiation: false,
    supportsSrpAuth: false,
    supportsSrp256Auth: false,
    supportsBooleanType: false,
    supportsDecfloat: false,
    supportsTimeZoneTypes: false,
    supportsReadOnlyTransactions: true,
    supportsNativeExplainPlan: false,
    recommendedAuthMode: 'legacy',
    notes: [
      'Legacy authentication profile expected.',
      'Do not assume modern wire encryption support.',
    ],
  },
  '3.x': {
    family: '3.x',
    supportsWireEncryptionNegotiation: true,
    supportsSrpAuth: true,
    supportsSrp256Auth: false,
    supportsBooleanType: true,
    supportsDecfloat: false,
    supportsTimeZoneTypes: false,
    supportsReadOnlyTransactions: true,
    supportsNativeExplainPlan: false,
    recommendedAuthMode: 'srp',
    notes: [
      'Srp is available and typically preferred over legacy auth.',
      'Wire encryption policies can affect client compatibility.',
    ],
  },
  '4.x': {
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
    notes: [
      'Modern authentication profiles are available.',
      'Extended SQL types are available compared with previous versions.',
    ],
  },
  '5.x': {
    family: '5.x',
    supportsWireEncryptionNegotiation: true,
    supportsSrpAuth: true,
    supportsSrp256Auth: true,
    supportsBooleanType: true,
    supportsDecfloat: true,
    supportsTimeZoneTypes: true,
    supportsReadOnlyTransactions: true,
    supportsNativeExplainPlan: true,
    recommendedAuthMode: 'srp256',
    notes: [
      'Use strict modern profile by default when environment allows it.',
      'Validate feature usage through capability checks, not assumptions.',
    ],
  },
};

function normalizeVersion(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Derives the generic engine family category based on a precise or partial version string.
 *
 * @param engineVersion - The raw string representation of the Firebird engine version.
 * @returns The categorized `FirebirdVersionFamily`.
 */
export function getVersionFamilyFromEngineVersion(engineVersion: string): FirebirdVersionFamily {
  const normalized = normalizeVersion(engineVersion);

  if (!normalized) {
    return 'unknown';
  }

  if (normalized.startsWith('2.5')) {
    return '2.5';
  }

  if (normalized.startsWith('3.')) {
    return '3.x';
  }

  if (normalized.startsWith('4.')) {
    return '4.x';
  }

  if (normalized.startsWith('5.')) {
    return '5.x';
  }

  return 'unknown';
}

/**
 * Retrieves the comprehensive capability profile associated with a specific Firebird engine version.
 * If the version is unknown, gracefully degrades to a strict, highly conservative feature set limit.
 *
 * @param engineVersion - The queried engine version string, if available.
 * @returns The resolved `FirebirdVersionCapabilities` matrix.
 */
export function getCapabilitiesForEngineVersion(
  engineVersion: string | undefined,
): FirebirdVersionCapabilities {
  const family = engineVersion ? getVersionFamilyFromEngineVersion(engineVersion) : 'unknown';

  if (family === 'unknown') {
    return {
      family: 'unknown',
      supportsWireEncryptionNegotiation: false,
      supportsSrpAuth: false,
      supportsSrp256Auth: false,
      supportsBooleanType: false,
      supportsDecfloat: false,
      supportsTimeZoneTypes: false,
      supportsReadOnlyTransactions: true,
      supportsNativeExplainPlan: false,
      recommendedAuthMode: 'mixed',
      notes: [
        'Unknown Firebird version: apply conservative compatibility defaults.',
        'Prefer read-only operations until version is confirmed.',
      ],
    };
  }

  return VERSION_CAPABILITY_MATRIX[family];
}

/**
 * Declares the definitively supported range of database engine versions this application was tested against.
 *
 * @returns An object containing the foundational minimum version and the targeted modern current architecture.
 */
export function getSupportedVersionRange(): {
  minimum: '2.5';
  targetCurrent: '5.x';
} {
  return {
    minimum: '2.5',
    targetCurrent: '5.x',
  };
}
