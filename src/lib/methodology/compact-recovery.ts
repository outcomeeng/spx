/**
 * Resolution of the compact-recovery directive from the installed methodology
 * package's foundation-resource manifest. Every failure names its resolution
 * step; the caller decides what an unresolved directive means for its surface.
 *
 * @module lib/methodology/compact-recovery
 */

import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import type { Result } from "@/config/types";

import {
  formatCompactRecoveryEntryAbsentError,
  formatFoundationPackageUnconfiguredError,
  formatFoundationResourceUnreadableError,
} from "./foundation-manifest";
import {
  containedPackageResourcePath,
  type MethodologyPackageFileSystem,
  resolveFoundationManifest,
} from "./package-resource";

export interface CompactRecoveryResolutionOptions {
  /** The payload product directory the methodology configuration was read from. */
  readonly productDir: string;
  /** The `methodology.packageDir` value from that product's configuration, when declared. */
  readonly packageDir: string | undefined;
  readonly fs: MethodologyPackageFileSystem;
}

/**
 * The exact bytes of the installed methodology package's manifest-named
 * compact-recovery resource, or the step-named diagnostic for the resolution
 * step that failed.
 */
export async function resolveCompactRecoveryDirective(
  options: CompactRecoveryResolutionOptions,
): Promise<Result<string>> {
  if (options.packageDir === undefined) {
    return {
      ok: false,
      error: formatFoundationPackageUnconfiguredError(METHODOLOGY_SECTION, METHODOLOGY_CONFIG_FIELDS.PACKAGE_DIR),
    };
  }
  const resolved = await resolveFoundationManifest(options.productDir, options.packageDir, options.fs);
  if (!resolved.ok) return resolved;
  const { packageDir: resolvedPackageDir, manifestPath, manifest } = resolved.value;
  const entry = manifest.compactRecovery;
  if (entry === undefined) {
    return { ok: false, error: formatCompactRecoveryEntryAbsentError(manifestPath) };
  }
  const resourcePath = await containedPackageResourcePath(resolvedPackageDir, entry, options.fs);
  if (resourcePath === undefined) {
    return { ok: false, error: formatFoundationResourceUnreadableError(entry, manifestPath) };
  }
  try {
    return { ok: true, value: await options.fs.readFile(resourcePath) };
  } catch {
    return { ok: false, error: formatFoundationResourceUnreadableError(entry, manifestPath) };
  }
}
