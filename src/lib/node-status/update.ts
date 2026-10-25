import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { defaultGitDependencies, type GitDependencies } from "@/lib/git/root";
import {
  createTrackedPathInclusion,
  listTrackedPaths,
  TRACKED_PATH_DIRECTORY_SEPARATOR,
} from "@/lib/git/tracked-paths";
import {
  createFilesystemSpecTreeSource,
  readSpecTree,
  SPEC_TREE_ENTRY_TYPE,
  type SpecTreeEvidenceSourceEntry,
  type SpecTreeNode,
  type SpecTreeSnapshot,
} from "@/lib/spec-tree";
import { resolveSpecTreeGrammarSelection, SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import {
  NODE_STATUS_CLAIM_SHAPE,
  type NodeStatusClaim,
  type NodeStatusClaimVerification,
  serializeNodeStatusClaim,
} from "./claim";
import { declaredNodeStatusClaimShape } from "./claim-shape";
import { createClaimHistoryReader } from "./claim-state";
import {
  createNodeStatusFile,
  createNodeStatusMechanismRecord,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FIELD,
  NODE_STATUS_VERIFICATION_MECHANISM,
  type NodeStatusEvidenceOutcome,
  type NodeStatusVerification,
  serializeNodeStatus,
} from "./classify";
import { createPinChangeReader } from "./currency";
import { createNodeStatusExcludeReader } from "./exclude";
import { foldNodeClaim, type NodeAttributedResultResolver, type NodeReadPathResolver } from "./fold";
import { readNodeStatus } from "./read";
import { readNodeSpecDeclaration } from "./spec-declaration";
import { collectNodeStatusFiles, nodeStatusPath } from "./status-files";

/**
 * Resolves a node's per-reference outcomes from recorded testing evidence.
 * An omitted reference is covered but stale and therefore retains its committed
 * outcome; an explicit not-run value means no recorded run covers the reference.
 */
export type NodeOutcomeResolver = (
  nodeId: string,
  evidencePaths: readonly string[],
) => Promise<Readonly<Record<string, NodeStatusEvidenceOutcome>>>;

export interface UpdateNodeStatusOptions {
  readonly productDir: string;
  readonly resolveOutcome: NodeOutcomeResolver;
  /** The paths each linked reference's recorded result read; a 4.0 result without them reads `not-run`. */
  readonly resolveReadPaths?: NodeReadPathResolver;
  /** The audit and evidence results sealed audit runs recorded; absent results read `not-run`. */
  readonly resolveAttributedResults?: NodeAttributedResultResolver;
  /**
   * Git runner used to resolve which node directories are git-tracked, so status
   * is written only into tracked node directories. Defaults to the production
   * runner; outside a git repository the query yields no scoping and every node
   * directory is written, so non-git fixtures see every node.
   */
  readonly gitDependencies?: GitDependencies;
}

const NODE_STATUS_TEXT_ENCODING = "utf8";
const NO_COMMITTED_RESULTS: NodeStatusClaimVerification = {};

/**
 * Classify every spec-tree node under `productDir` and write its lifecycle state
 * to a co-located `spx.status.json`. This is the only path that writes the file.
 */
export async function updateNodeStatus(options: UpdateNodeStatusOptions): Promise<void> {
  const { productDir, resolveOutcome, gitDependencies = defaultGitDependencies } = options;
  const claimShape = await declaredNodeStatusClaimShape(productDir);
  const liveStatusPaths = new Set<string>();

  if (claimShape === NODE_STATUS_CLAIM_SHAPE.CURRENT) {
    for (const { nodeId, claim } of await foldTrackedNodeClaims(options)) {
      const statusPath = nodeStatusPath(productDir, nodeId);
      liveStatusPaths.add(statusPath);
      await writeText(statusPath, serializeNodeStatusClaim(claim));
    }
    await removeStaleNodeStatusFiles(productDir, liveStatusPaths);
    return;
  }

  const snapshot = await readSpecTree({ source: createFilesystemSpecTreeSource({ productDir }) });
  const excludeReader = createNodeStatusExcludeReader(productDir);
  const trackedPaths = await listTrackedPaths(productDir, gitDependencies);
  const isTrackedNodeDirectory = createTrackedPathInclusion(trackedPaths);
  const evidenceByNode = collectEvidenceByNode(snapshot);

  for (const node of snapshot.allNodes) {
    if (!isTrackedNodeDirectory(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${TRACKED_PATH_DIRECTORY_SEPARATOR}${node.id}`)) {
      continue;
    }
    const evidence = evidenceByNode.get(node.id) ?? [];
    const statusPath = nodeStatusPath(productDir, node.id);
    const committed = readNodeStatus(dirname(statusPath));
    liveStatusPaths.add(statusPath);
    const verification = await resolveVerification(node, {
      evidence,
      isExcluded: excludeReader.isExcluded(node),
      resolveOutcome,
      committedOutcomes: testOutcomes(
        committed?.shape === NODE_STATUS_CLAIM_SHAPE.VERSION_1
          ? committed.claim[NODE_STATUS_FIELD.VERIFICATION]
          : undefined,
      ),
    });
    await writeNodeStatus(statusPath, verification);
  }

  await removeStaleNodeStatusFiles(productDir, liveStatusPaths);
}

/** The claims a checkout holds and the claims `updateNodeStatus` would write over it, keyed by node id. */
export interface NodeStatusClaimRegeneration {
  readonly committed: ReadonlyMap<string, NodeStatusClaim>;
  readonly regenerated: ReadonlyMap<string, NodeStatusClaim>;
}

/**
 * Read each tracked node's committed claim and fold the claim `updateNodeStatus` would write, writing
 * nothing. A product that declares the earlier claim shape holds no claims to regenerate and yields none.
 */
export async function regenerateNodeStatusClaims(
  options: UpdateNodeStatusOptions,
): Promise<NodeStatusClaimRegeneration> {
  const committed = new Map<string, NodeStatusClaim>();
  const regenerated = new Map<string, NodeStatusClaim>();
  if (await declaredNodeStatusClaimShape(options.productDir) !== NODE_STATUS_CLAIM_SHAPE.CURRENT) {
    return { committed, regenerated };
  }
  for (const { nodeId, claim, committed: committedClaim } of await foldTrackedNodeClaims(options)) {
    regenerated.set(nodeId, claim);
    if (committedClaim !== undefined) committed.set(nodeId, committedClaim);
  }
  return { committed, regenerated };
}

interface FoldedNodeClaim {
  readonly nodeId: string;
  readonly claim: NodeStatusClaim;
  readonly committed: NodeStatusClaim | undefined;
}

async function foldTrackedNodeClaims(options: UpdateNodeStatusOptions): Promise<readonly FoldedNodeClaim[]> {
  const { productDir, resolveOutcome, gitDependencies = defaultGitDependencies } = options;
  const snapshot = await readSpecTree({ source: createFilesystemSpecTreeSource({ productDir }) });
  // The boundary is the node directory: a claim is folded only for a git-tracked
  // node directory. A tracked node's own untracked, not-yet-staged evidence stays
  // visible, so the projection matches what CI regenerates once it is committed.
  const trackedPaths = await listTrackedPaths(productDir, gitDependencies);
  const isTrackedNodeDirectory = createTrackedPathInclusion(trackedPaths);
  const pinChanges = createPinChangeReader({ productDir, git: gitDependencies });
  const history = createClaimHistoryReader({ productDir, git: gitDependencies });
  const evidenceByNode = collectEvidenceByNode(snapshot);
  const selection = await resolveSpecTreeGrammarSelection(productDir);
  const claimFoldContext = {
    productDir,
    git: gitDependencies,
    trackedPaths: trackedPaths ?? new Set<string>(),
    pinChanges,
    history,
    ...(options.resolveReadPaths === undefined ? {} : { resolveReadPaths: options.resolveReadPaths }),
    ...(options.resolveAttributedResults === undefined
      ? {}
      : { resolveAttributedResults: options.resolveAttributedResults }),
  };

  const folded: FoldedNodeClaim[] = [];
  for (const node of snapshot.allNodes) {
    if (!isTrackedNodeDirectory(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${TRACKED_PATH_DIRECTORY_SEPARATOR}${node.id}`)) {
      continue;
    }
    const evidence = evidenceByNode.get(node.id) ?? [];
    const read = readNodeStatus(dirname(nodeStatusPath(productDir, node.id)));
    const committed = read?.shape === NODE_STATUS_CLAIM_SHAPE.CURRENT ? read.claim : undefined;
    const claim = await foldNodeClaim({
      ...claimFoldContext,
      nodeId: node.id,
      declaration: await readNodeSpecDeclaration(productDir, node.id, selection),
      evidencePaths: evidencePaths(evidence),
      outcomes: evidence.length === 0 ? {} : await resolveOutcome(node.id, evidencePaths(evidence)),
      committed: committed?.[NODE_STATUS_FIELD.VERIFICATION] ?? NO_COMMITTED_RESULTS,
    });
    folded.push({ nodeId: node.id, claim, committed });
  }
  return folded;
}

type VerificationInput = {
  readonly evidence: readonly SpecTreeEvidenceSourceEntry[];
  readonly isExcluded: boolean;
  readonly resolveOutcome: NodeOutcomeResolver;
  readonly committedOutcomes: Readonly<Record<string, NodeStatusEvidenceOutcome>>;
};

async function resolveVerification(
  node: SpecTreeNode,
  input: VerificationInput,
): Promise<NodeStatusVerification> {
  // The resolver is consulted only when its outcome can change the classification
  // — a node with no linked evidence is declared, and an excluded node is specified,
  // before any outcome is resolved.
  if (input.evidence.length === 0) return {};
  if (input.isExcluded) return createTestVerification(input.evidence, NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
  return createTestVerificationFromOutcomes(
    input.evidence,
    await input.resolveOutcome(node.id, evidencePaths(input.evidence)),
    input.committedOutcomes,
  );
}

function collectEvidenceByNode(
  snapshot: SpecTreeSnapshot,
): ReadonlyMap<string, readonly SpecTreeEvidenceSourceEntry[]> {
  const evidenceByNode = new Map<string, SpecTreeEvidenceSourceEntry[]>();
  for (const entry of snapshot.entries) {
    if (entry.type === SPEC_TREE_ENTRY_TYPE.EVIDENCE) {
      const entries = evidenceByNode.get(entry.parentId) ?? [];
      entries.push(entry);
      evidenceByNode.set(entry.parentId, entries);
    }
  }
  return evidenceByNode;
}

function createTestVerification(
  evidence: readonly SpecTreeEvidenceSourceEntry[],
  outcome: NodeStatusEvidenceOutcome,
): NodeStatusVerification {
  const outcomes = Object.fromEntries(evidence.map((entry) => [evidencePath(entry), outcome]));
  return createTestVerificationFromOutcomes(evidence, outcomes, {});
}

function createTestVerificationFromOutcomes(
  evidence: readonly SpecTreeEvidenceSourceEntry[],
  resolvedOutcomes: Readonly<Partial<Record<string, NodeStatusEvidenceOutcome>>>,
  committedOutcomes: Readonly<Partial<Record<string, NodeStatusEvidenceOutcome>>>,
): NodeStatusVerification {
  const outcomes: Record<string, NodeStatusEvidenceOutcome> = {};
  for (const entry of evidence) {
    const path = evidencePath(entry);
    outcomes[path] = resolvedOutcomes[path]
      ?? committedOutcomes[path]
      ?? NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN;
  }
  return { [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: createNodeStatusMechanismRecord(outcomes) };
}

function testOutcomes(
  verification: NodeStatusVerification | undefined,
): Readonly<Record<string, NodeStatusEvidenceOutcome>> {
  const record = verification?.[NODE_STATUS_VERIFICATION_MECHANISM.TEST];
  if (record === undefined) return {};
  return Object.fromEntries(
    Object.entries(record).filter(([reference]) => reference !== NODE_STATUS_FIELD.OVERALL),
  ) as Readonly<Record<string, NodeStatusEvidenceOutcome>>;
}

function evidencePaths(evidence: readonly SpecTreeEvidenceSourceEntry[]): readonly string[] {
  return evidence.map(evidencePath);
}

function evidencePath(entry: SpecTreeEvidenceSourceEntry): string {
  return entry.ref?.path ?? entry.id;
}

async function writeNodeStatus(
  filePath: string,
  verification: NodeStatusVerification,
): Promise<void> {
  await writeText(filePath, serializeNodeStatus(createNodeStatusFile(verification)));
}

async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, NODE_STATUS_TEXT_ENCODING);
}

async function removeStaleNodeStatusFiles(
  productDir: string,
  liveStatusPaths: ReadonlySet<string>,
): Promise<void> {
  const statusPaths = await collectNodeStatusFiles(join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY));
  await Promise.all(statusPaths.filter((path) => !liveStatusPaths.has(path)).map((path) => rm(path, { force: true })));
}
