export const DEFAULT_PROTOCOL_VERSION = '2025-03-26';

export const SUPPORTED_PROTOCOL_VERSIONS: ReadonlyArray<string> = [
  DEFAULT_PROTOCOL_VERSION,
  '2024-11-05',
];

export function isSupportedProtocolVersion(protocolVersion: string): boolean {
  return SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion);
}
