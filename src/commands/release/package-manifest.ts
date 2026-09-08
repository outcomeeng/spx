import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const PACKAGE_MANIFEST = "package.json";

const MANIFEST_FIELD = {
  NAME: "name",
  VERSION: "version",
} as const;

export interface PackageIdentity {
  readonly name: string;
  readonly version: string;
}

export class PackageManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackageManifestError";
  }
}

/** Reads the product's package version from its manifest. */
export async function readPackageVersion(productDir: string): Promise<string> {
  return requireManifestString(await readPackageManifest(productDir), MANIFEST_FIELD.VERSION);
}

/** Reads the product's package name and version from its manifest. */
export async function readPackageIdentity(productDir: string): Promise<PackageIdentity> {
  const manifest = await readPackageManifest(productDir);
  return {
    name: requireManifestString(manifest, MANIFEST_FIELD.NAME),
    version: requireManifestString(manifest, MANIFEST_FIELD.VERSION),
  };
}

async function readPackageManifest(productDir: string): Promise<Record<string, unknown>> {
  const manifest = JSON.parse(await readFile(join(productDir, PACKAGE_MANIFEST), "utf8")) as unknown;
  if (typeof manifest !== "object" || manifest === null) {
    throw new PackageManifestError(`${PACKAGE_MANIFEST} must contain an object`);
  }
  return manifest as Record<string, unknown>;
}

function requireManifestString(manifest: Record<string, unknown>, field: string): string {
  const value = manifest[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PackageManifestError(`${PACKAGE_MANIFEST} ${field} must be a non-empty string`);
  }
  return value;
}
