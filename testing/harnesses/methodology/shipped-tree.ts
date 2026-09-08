/**
 * Observations of the methodology trees this checkout ships, for tests that
 * run the built executable against its own package: the executable resolves
 * the tree root from its module location, so a test that declares a shipped
 * version reads the same bytes the package carries.
 *
 * @module harnesses/methodology/shipped-tree
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { FOUNDATION_MANIFEST_FIELDS, FOUNDATION_MANIFEST_RELATIVE_PATH } from "@/lib/methodology/foundation-manifest";
import { FOUNDATION_PLUGIN_NAME, methodologyTreeRelativeDir, methodologyTreeRootDir } from "@/lib/methodology/tree";
import { defaultMethodologyTreeFileSystem, METHODOLOGY_RESOURCE_ENCODING } from "@/lib/methodology/tree-resource";
import { PRODUCT_ROOT } from "@testing/harnesses/constants";

const PATCH_ZERO = ".0";

/** An exact version whose line this checkout ships, with that line. */
export interface ShippedMethodologyVersion {
  readonly text: string;
  readonly line: string;
}

/** Absolute path of this checkout's shipped `methodology/` directory. */
export function shippedMethodologyTreeRoot(): string {
  return methodologyTreeRootDir(PRODUCT_ROOT);
}

/** The first line this checkout ships, as an exact version on that line. */
export async function shippedMethodologyVersion(): Promise<ShippedMethodologyVersion> {
  const line = (await defaultMethodologyTreeFileSystem.readDirectoryNames(shippedMethodologyTreeRoot())).at(0);
  if (line === undefined) throw new Error(`${shippedMethodologyTreeRoot()} ships no methodology line`);
  return { text: `${line}${PATCH_ZERO}`, line };
}

/**
 * The exact text of the shipped core foundation body for one coding agent on
 * a shipped line. The core is located by plain JSON access to the manifest's
 * core field, so the oracle shares no code with the production manifest
 * parser whose output the linked test compares against it.
 */
export async function shippedFoundationCoreText(line: string, codingAgent: string): Promise<string> {
  const treeDir = join(shippedMethodologyTreeRoot(), line, codingAgent, FOUNDATION_PLUGIN_NAME);
  const manifestPath = join(treeDir, FOUNDATION_MANIFEST_RELATIVE_PATH);
  const manifest: unknown = JSON.parse(await readFile(manifestPath, METHODOLOGY_RESOURCE_ENCODING));
  const core = typeof manifest === "object" && manifest !== null
    ? (manifest as Record<string, unknown>)[FOUNDATION_MANIFEST_FIELDS.CORE]
    : undefined;
  if (typeof core !== "string") {
    throw new Error(`${manifestPath} names no ${FOUNDATION_MANIFEST_FIELDS.CORE} resource`);
  }
  return readFile(join(treeDir, core), METHODOLOGY_RESOURCE_ENCODING);
}

/**
 * The exact text of the shipped compact-recovery resource for one coding agent
 * on a shipped line, or `undefined` when the shipped manifest names none. The
 * entry is located by plain JSON access, independent of the production parser.
 */
export async function shippedCompactRecoveryText(line: string, codingAgent: string): Promise<string | undefined> {
  const treeDir = join(shippedMethodologyTreeRoot(), line, codingAgent, FOUNDATION_PLUGIN_NAME);
  const manifest: unknown = JSON.parse(
    await readFile(join(treeDir, FOUNDATION_MANIFEST_RELATIVE_PATH), METHODOLOGY_RESOURCE_ENCODING),
  );
  const entry = typeof manifest === "object" && manifest !== null
    ? (manifest as Record<string, unknown>)[FOUNDATION_MANIFEST_FIELDS.COMPACT_RECOVERY]
    : undefined;
  if (entry === undefined) return undefined;
  if (typeof entry !== "string") throw new Error(`${treeDir} names a non-string compact-recovery entry`);
  return readFile(join(treeDir, entry), METHODOLOGY_RESOURCE_ENCODING);
}

/** The package-relative directory of one shipped tree, for diagnostics that name it. */
export function shippedTreeRelativeDir(line: string, codingAgent: string): string {
  const relative = methodologyTreeRelativeDir(line, codingAgent);
  if (!relative.ok) throw new Error(relative.error);
  return relative.value;
}
