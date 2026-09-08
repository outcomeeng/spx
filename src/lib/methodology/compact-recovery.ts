/**
 * Resolution of the compact-recovery directive from the foundation-resource
 * manifest of spx's shipped methodology tree for the payload product's
 * declared line and the invoking coding agent. Every failure names its
 * resolution step; the caller decides what an unresolved directive means for
 * its surface.
 *
 * @module lib/methodology/compact-recovery
 */

import type { MethodologyConfig } from "@/config/methodology";
import { requireMethodologyVersion } from "@/config/methodology";
import type { Result } from "@/config/types";

import { formatCompactRecoveryEntryAbsentError, formatFoundationResourceUnreadableError } from "./foundation-manifest";
import {
  containedTreeResourcePath,
  type MethodologyTreeFileSystem,
  resolveFoundationManifest,
  resolveMethodologyTree,
} from "./tree-resource";

export interface CompactRecoveryResolutionOptions {
  /** Absolute path of spx's `methodology/` directory. */
  readonly treeRoot: string;
  /** The payload product's resolved methodology configuration. */
  readonly methodology: MethodologyConfig;
  /** The invoking coding agent, in the shipped layout's vocabulary. */
  readonly codingAgent: string | undefined;
  readonly fs: MethodologyTreeFileSystem;
}

/**
 * The exact bytes of the shipped tree's manifest-named compact-recovery
 * resource, or the step-named diagnostic for the resolution step that failed.
 */
export async function resolveCompactRecoveryDirective(
  options: CompactRecoveryResolutionOptions,
): Promise<Result<string>> {
  const version = requireMethodologyVersion(options.methodology);
  if (!version.ok) return version;
  const tree = await resolveMethodologyTree({
    treeRoot: options.treeRoot,
    version: version.value,
    codingAgent: options.codingAgent,
    fs: options.fs,
  });
  if (!tree.ok) return tree;
  const resolved = await resolveFoundationManifest(tree.value.treeDir, options.fs);
  if (!resolved.ok) return resolved;
  const { treeDir, manifestPath, manifest } = resolved.value;
  const entry = manifest.compactRecovery;
  if (entry === undefined) {
    return { ok: false, error: formatCompactRecoveryEntryAbsentError(manifestPath) };
  }
  const resourcePath = await containedTreeResourcePath(treeDir, entry, options.fs);
  if (resourcePath === undefined) {
    return { ok: false, error: formatFoundationResourceUnreadableError(entry, manifestPath) };
  }
  try {
    return { ok: true, value: await options.fs.readFile(resourcePath) };
  } catch {
    return { ok: false, error: formatFoundationResourceUnreadableError(entry, manifestPath) };
  }
}
