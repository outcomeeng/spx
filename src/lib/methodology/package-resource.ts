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
import { resolve } from "node:path";

import { isPathContained } from "@/lib/file-system/pathContainment";

export const METHODOLOGY_RESOURCE_ENCODING = "utf8";

export interface MethodologyPackageFileSystem {
  realPath(path: string): Promise<string>;
  readFile(path: string): Promise<string>;
}

export const defaultMethodologyPackageFileSystem: MethodologyPackageFileSystem = {
  realPath: nodeRealPath,
  readFile: (path) => nodeReadFile(path, METHODOLOGY_RESOURCE_ENCODING),
};

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
