import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { defaultGitDependencies, type GitDependencies } from "@/lib/git/root";
import { listTrackedPaths } from "@/lib/git/tracked-paths";
import {
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_NODE_STATE,
  type SpecTreeEvidenceProvider,
  type SpecTreeNodeSourceEntry,
  type SpecTreeNodeState,
} from "@/lib/spec-tree";
import {
  NODE_STATUS_CLAIM_FIELD,
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_CLAIM_SHAPE,
  type NodeStatusClaim,
  nodeStatusClaimResults,
} from "./claim";
import {
  classifyNodeClaim,
  classifyParentOfVariants,
  createClaimHistoryReader,
  governingDeclarationPaths,
} from "./claim-state";
import { classifyNodeStatus, hasNodeStatusVerificationReferences } from "./classify";
import { createPinChangeReader, resultCurrency } from "./currency";
import { createNodeStatusExcludeReader } from "./exclude";
import { unrecordableResults } from "./fold";
import { NODE_STATUS_FILENAME, parseNodeStatusFile } from "./read";
import { readNodeSpecDeclaration } from "./spec-declaration";
import { collectNodeStatusFiles } from "./status-files";

export const VARIANT_DIRECTORY_SUFFIX = ".variant";
const PATH_SEPARATOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;
const ROOT_PREFIX = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${PATH_SEPARATOR}`;
const SLUG_OF_DIRECTORY = /^\d+(?:\.\d+)?-(.+)\.[a-z]+$/;

export interface NodeStatusProviderOptions {
  /** Git runner for pin currency and claim history; defaults to the production runner. */
  readonly gitDependencies?: GitDependencies;
}

/**
 * Build a spec-tree evidence provider that overrides each node's live-derived
 * state with the state derived from its co-located `spx.status.json`.
 *
 * Each claim is read in the shape it was written: a version-1 claim classifies
 * from spec structure and its mechanism rollups, a 4.0 claim from each result's
 * verdict and the currency of its pin against the checkout. A parent whose
 * `.variant` children carry claims takes its state from theirs. A node with no
 * persisted file yields `undefined`, which routes the spec-tree library back to
 * live derivation. The factory resolves every state before it returns, so the
 * provider itself reads nothing and writes nothing.
 *
 * @param productDir - Absolute path to the product directory.
 */
export async function createNodeStatusProvider(
  productDir: string,
  options: NodeStatusProviderOptions = {},
): Promise<SpecTreeEvidenceProvider> {
  const { gitDependencies = defaultGitDependencies } = options;
  const excludeReader = createNodeStatusExcludeReader(productDir);
  const pinChanges = createPinChangeReader({ productDir, git: gitDependencies });
  const history = createClaimHistoryReader({ productDir, git: gitDependencies });
  let trackedPaths: Promise<ReadonlySet<string>> | undefined;
  const readTrackedPaths = (): Promise<
    ReadonlySet<string>
  > => (trackedPaths ??= listTrackedPaths(productDir, gitDependencies).then((paths) => paths ?? new Set<string>()));
  const treeRoot = join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY);
  const statesByNode = new Map<string, SpecTreeNodeState>();
  const variantsByParent = new Map<string, string[]>();

  for (const statusPath of await collectNodeStatusFiles(treeRoot)) {
    const nodeDir = dirname(statusPath);
    const nodeId = relative(treeRoot, nodeDir).split(/[\\/]/).join(PATH_SEPARATOR);
    const read = parseNodeStatusFile(JSON.parse(readFileSync(statusPath, "utf8")), statusPath);
    if (read.shape === NODE_STATUS_CLAIM_SHAPE.VERSION_1) {
      statesByNode.set(
        nodeId,
        classifyNodeStatus({
          hasVerificationReferences: hasNodeStatusVerificationReferences(read.claim.verification),
          isExcluded: excludeReader.isExcluded({ id: nodeId }),
          verification: read.claim.verification,
        }),
      );
      continue;
    }
    statesByNode.set(nodeId, await classifyClaim(nodeId, read.claim));
    if (nodeId.endsWith(VARIANT_DIRECTORY_SUFFIX)) {
      const parent = dirname(nodeId);
      variantsByParent.set(parent, [...(variantsByParent.get(parent) ?? []), nodeId]);
    }
  }
  for (const [parent, variants] of variantsByParent) {
    statesByNode.set(
      parent,
      classifyParentOfVariants(variants.map((variant) => statesByNode.get(variant) ?? SPEC_TREE_NODE_STATE.DECLARED)),
    );
  }
  return {
    stateForNode(node: SpecTreeNodeSourceEntry): SpecTreeNodeState | undefined {
      return statesByNode.get(node.id);
    },
  };

  async function classifyClaim(nodeId: string, claim: NodeStatusClaim): Promise<SpecTreeNodeState> {
    const recorded = await Promise.all(
      nodeStatusClaimResults(claim).map(async ({ section, entry }) => ({
        verdict: entry[NODE_STATUS_CLAIM_FIELD.VERDICT],
        currency: await resultCurrency(section, entry, pinChanges),
      })),
    );
    const results = [...recorded, ...unrecordableResults(await readNodeSpecDeclaration(productDir, nodeId))];
    const nodePath = `${ROOT_PREFIX}${nodeId}`;
    const facts = {
      requiredArtifactsMissing: !claimLinksEvidenceArtifacts(claim),
      results,
    };
    const withoutHistory = classifyNodeClaim({ ...facts, recordedPassingAtOrAfterDeclaration: false });
    if (withoutHistory === SPEC_TREE_NODE_STATE.PASSING) return withoutHistory;
    const tracked = await readTrackedPaths();
    const declarationPaths = governingDeclarationPaths(nodePath, specPathOf(nodePath, tracked), tracked);
    return classifyNodeClaim({
      ...facts,
      recordedPassingAtOrAfterDeclaration: await history.recordedPassingAtOrAfterDeclaration(
        `${nodePath}${PATH_SEPARATOR}${NODE_STATUS_FILENAME}`,
        declarationPaths,
      ),
    });
  }
}

/** The tracked spec file of a node: the canonical `{slug}.spec.md` or the prior `{slug}.md`. */
function specPathOf(nodePath: string, trackedPaths: ReadonlySet<string>): string {
  const directoryName = nodePath.slice(nodePath.lastIndexOf(PATH_SEPARATOR) + 1);
  const slug = SLUG_OF_DIRECTORY.exec(directoryName)?.[1] ?? directoryName;
  const canonical = `${nodePath}${PATH_SEPARATOR}${slug}${SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX}`;
  return trackedPaths.has(canonical)
    ? canonical
    : `${nodePath}${PATH_SEPARATOR}${slug}${SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX}`;
}

/** Whether the claim records a result for a linked test, eval or probe artifact, the entries the writer folds only from the node's evidence paths. */
function claimLinksEvidenceArtifacts(claim: NodeStatusClaim): boolean {
  const verification = claim[NODE_STATUS_CLAIM_FIELD.VERIFICATION];
  return ARTIFACT_SECTIONS.some((section) => Object.keys(verification[section] ?? {}).length > 0);
}

const ARTIFACT_SECTIONS = [
  NODE_STATUS_CLAIM_SECTION.TEST,
  NODE_STATUS_CLAIM_SECTION.EVAL,
  NODE_STATUS_CLAIM_SECTION.PROBE,
] as const;
