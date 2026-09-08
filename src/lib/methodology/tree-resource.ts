/**
 * Contained reads of manifest-named resources from an installed methodology
 * package: a resource path binds a read only when it resolves — through any
 * symbolic link — inside the installed package location. The filesystem enters
 * through an injected interface so consumers verify over temp-directory
 * fixtures without an installed plugin.
 *
 * @module lib/methodology/package-resource
 */

import { readFile as nodeReadFile, realpath as nodeRealPath } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { Result } from "@/config/types";
import { isPathContained } from "@/lib/file-system/pathContainment";

import {
  formatFoundationManifestInvalidError,
  formatFoundationManifestUnreadableError,
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  type FoundationResourceManifest,
  parseFoundationResourceManifest,
} from "./foundation-manifest";

export const METHODOLOGY_RESOURCE_ENCODING = "utf8";

export interface MethodologyPackageFileSystem {
  realPath(path: string): Promise<string>;
  readFile(path: string): Promise<string>;
}

export const defaultMethodologyPackageFileSystem: MethodologyPackageFileSystem = {
  realPath: nodeRealPath,
  // A strict decode makes a non-UTF-8 resource unreadable instead of emitting
  // replacement characters, and a leading byte-order mark stays in the decoded
  // text, so byte equality holds for everything that resolves.
  readFile: async (path) =>
    new TextDecoder(METHODOLOGY_RESOURCE_ENCODING, { fatal: true, ignoreBOM: true }).decode(await nodeReadFile(path)),
};

/** A resolved installed-package manifest: the package root, the manifest's location, and its validated content. */
export interface ResolvedFoundationManifest {
  readonly packageDir: string;
  readonly manifestPath: string;
  readonly manifest: FoundationResourceManifest;
}

/**
 * Resolves the installed methodology package's foundation-resource manifest
 * from the configured package location: package-root resolution, the manifest
 * path, the manifest read, and schema validation, with each failure named by
 * its manifest diagnostic.
 */
export async function resolveFoundationManifest(
  productDir: string,
  packageDir: string,
  fs: MethodologyPackageFileSystem,
): Promise<Result<ResolvedFoundationManifest>> {
  const resolvedPackageDir = resolve(productDir, packageDir);
  const manifestPath = join(resolvedPackageDir, FOUNDATION_MANIFEST_RELATIVE_PATH);
  let manifestText: string;
  try {
    manifestText = await fs.readFile(manifestPath);
  } catch {
    return { ok: false, error: formatFoundationManifestUnreadableError(manifestPath) };
  }
  const manifest = parseFoundationResourceManifest(manifestText);
  if (!manifest.ok) {
    return { ok: false, error: formatFoundationManifestInvalidError(manifestPath, manifest.error) };
  }
  return { ok: true, value: { packageDir: resolvedPackageDir, manifestPath, manifest: manifest.value } };
}

/**
 * The canonical absolute location of a package resource, or undefined when the
 * path — before or after resolving symbolic links — escapes the installed
 * package location or names no existing file.
 */
export async function containedPackageResourcePath(
  packageDir: string,
  resourcePath: string,
  fs: MethodologyPackageFileSystem,
): Promise<string | undefined> {
  if (!isPathContained(packageDir, resourcePath)) return undefined;
  let canonicalRoot: string;
  let canonicalResource: string;
  try {
    canonicalRoot = await fs.realPath(packageDir);
    canonicalResource = await fs.realPath(resolve(packageDir, resourcePath));
  } catch {
    return undefined;
  }
  return isPathContained(canonicalRoot, canonicalResource) ? canonicalResource : undefined;
}
