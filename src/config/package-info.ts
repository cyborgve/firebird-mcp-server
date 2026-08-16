import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Represents vital metadata extracted from the project's package.json.
 */
interface PackageInfo {
  /** The registered module name of the package. */
  name: string;
  /** The semantic version string of the package. */
  version: string;
}

let cached: PackageInfo | undefined;

/**
 * Synchronously retrieves the runtime name and version from the project's `package.json` file.
 * The output is permanently cached per process lifetime for optimal performance.
 *
 * @returns The resolved `PackageInfo` object, gracefully defaulting to fallback values if reading fails.
 */
export function getPackageInfo(): PackageInfo {
  if (cached) {
    return cached;
  }

  try {
    const packagePath = resolve(__dirname, '..', '..', 'package.json');
    const raw = readFileSync(packagePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null) {
      return fallback();
    }

    const pkg = parsed as Record<string, unknown>;
    const name = typeof pkg.name === 'string' ? pkg.name : 'firebird-mcp-server';
    const version = typeof pkg.version === 'string' ? pkg.version : '0.0.0';

    cached = { name, version };
    return cached;
  } catch {
    return fallback();
  }
}

/**
 * Constructs a resilient fallback package configuration.
 *
 * @returns A safe, non-breaking `PackageInfo` object.
 */
function fallback(): PackageInfo {
  const info: PackageInfo = { name: 'firebird-mcp-server', version: '0.0.0' };
  cached = info;
  return info;
}

/**
 * Forcibly flushes the internal metadata cache.
 * Exclusively intended for isolated unit testing scenarios to simulate cold-starts.
 */
export function resetPackageInfoCache(): void {
  cached = undefined;
}
