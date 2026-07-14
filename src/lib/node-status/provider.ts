import { join } from "node:path";

import {
  SPEC_TREE_CONFIG,
  type SpecTreeEvidenceProvider,
  type SpecTreeNodeSourceEntry,
  type SpecTreeNodeState,
} from "@/lib/spec-tree";
import { classifyNodeStatus, hasNodeStatusVerificationReferences } from "./classify";
import { createNodeStatusExcludeReader } from "./exclude";
import { readNodeStatus } from "./read";

/**
 * Resolve the absolute directory of a spec-tree node under `productDir`.
 *
 * A node source entry's `id` is its directory path relative to the spec-tree
 * root, so the node directory is `productDir/<root>/<id>`.
 */
function nodeDirectory(productDir: string, node: SpecTreeNodeSourceEntry): string {
  return join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, node.id);
}

/**
 * Build a spec-tree evidence provider that overrides each node's live-derived
 * state with the state persisted in its co-located `spx.status.json`.
 *
 * The provider closes over `productDir` because `stateForNode` receives only the
 * node source entry and in-memory evidence — no filesystem path. A node with no
 * persisted file yields `undefined`, which routes the spec-tree library back to
 * live derivation.
 *
 * @param productDir - Absolute path to the product directory.
 */
export function createNodeStatusProvider(productDir: string): SpecTreeEvidenceProvider {
  const excludeReader = createNodeStatusExcludeReader(productDir);
  return {
    stateForNode(node: SpecTreeNodeSourceEntry): SpecTreeNodeState | undefined {
      const status = readNodeStatus(nodeDirectory(productDir, node));
      if (status === undefined) return undefined;
      return classifyNodeStatus({
        hasVerificationReferences: hasNodeStatusVerificationReferences(status.verification),
        isExcluded: excludeReader.isExcluded(node),
        verification: status.verification,
      });
    },
  };
}
