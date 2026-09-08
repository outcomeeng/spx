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

import {
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  parseFoundationResourceManifest,
} from "@/lib/methodology/foundation-manifest";
import { FOUNDATION_PLUGIN_NAME, METHODOLOGY_TREE_ROOT, methodologyTreeRelativeDir } from "@/lib/methodology/tree";
import { defaultMethodologyTreeFileSystem } from "@/lib/methodology/tree-resource";
import { PRODUCT_ROOT } from "@testing/harnesses/constants";

const PATCH_ZERO = ".0";

/** An exact version whose line this checkout ships, with that line. */
export interface ShippedMethodologyVersion {
  readonly text: string;
  readonly line: string;
}

/** Absolute path of this checkout's shipped `methodology/` directory. */
export function shippedMethodologyTreeRoot(): string {
  return join(PRODUCT_ROOT, METHODOLOGY_TREE_ROOT);
}

/** The first line this checkout ships, as an exact version on that line. */
export async function shippedMethodologyVersion(): Promise<ShippedMethodologyVersion> {
  const [line] = await defaultMethodologyTreeFileSystem.readDirectoryNames(shippedMethodologyTreeRoot());
  if (line === undefined) throw new Error(`${shippedMethodologyTreeRoot()} ships no methodology line`);
  return { text: `${line}${PATCH_ZERO}`, line };
}

/** The exact text of the shipped core foundation body for one coding agent on a shipped line. */
export async function shippedFoundationCoreText(line: string, codingAgent: string): Promise<string> {
  const treeDir = join(shippedMethodologyTreeRoot(), line, codingAgent, FOUNDATION_PLUGIN_NAME);
  const manifest = parseFoundationResourceManifest(
    await readFile(join(treeDir, FOUNDATION_MANIFEST_RELATIVE_PATH), "utf8"),
  );
  if (!manifest.ok) throw new Error(manifest.error);
  return readFile(join(treeDir, manifest.value.core), "utf8");
}

/** The package-relative directory of one shipped tree, for diagnostics that name it. */
export function shippedTreeRelativeDir(line: string, codingAgent: string): string {
  const relative = methodologyTreeRelativeDir(line, codingAgent);
  if (!relative.ok) throw new Error(relative.error);
  return relative.value;
}
