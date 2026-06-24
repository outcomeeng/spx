import type { Dirent } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createIgnoreSourceReader, IGNORE_SOURCE_FILENAME_DEFAULT } from "@/lib/file-inclusion/ignore-source";
import {
  createFilesystemSpecTreeSource,
  readSpecTree,
  SPEC_TREE_ENTRY_TYPE,
  type SpecTreeEvidenceSourceEntry,
  type SpecTreeNode,
  type SpecTreeSnapshot,
} from "@/lib/spec-tree";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import {
  createNodeStatusFile,
  createNodeStatusMechanismRecord,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_VERIFICATION_MECHANISM,
  type NodeStatusEvidenceOutcome,
  type NodeStatusVerification,
  serializeNodeStatus,
} from "./classify";
import { NODE_STATUS_FILENAME } from "./read";

/**
 * Resolves a node's per-reference test outcomes — from recorded testing evidence
 * when it is usable, otherwise by running the node's tests. Injected at the
 * command edge so the classifier's precedence logic is verifiable without
 * executing a real suite.
 */
export type NodeOutcomeResolver = (
  nodeId: string,
  evidencePaths: readonly string[],
) => Promise<Readonly<Record<string, NodeStatusEvidenceOutcome>>>;

export interface UpdateNodeStatusOptions {
  readonly productDir: string;
  readonly resolveOutcome: NodeOutcomeResolver;
}

const NODE_STATUS_TEXT_ENCODING = "utf8";

/**
 * Classify every spec-tree node under `productDir` and write its lifecycle state
 * to a co-located `spx.status.json`. This is the only path that writes the file.
 */
export async function updateNodeStatus(options: UpdateNodeStatusOptions): Promise<void> {
  const { productDir, resolveOutcome } = options;
  const snapshot = await readSpecTree({ source: createFilesystemSpecTreeSource({ productDir }) });
  const ignoreReader = createIgnoreSourceReader(productDir, {
    ignoreSourceFilename: IGNORE_SOURCE_FILENAME_DEFAULT,
    specTreeRootSegment: SPEC_TREE_CONFIG.ROOT_DIRECTORY,
  });
  const evidenceByNode = collectEvidenceByNode(snapshot);
  const liveStatusPaths = new Set<string>();

  for (const node of snapshot.allNodes) {
    const evidence = evidenceByNode.get(node.id) ?? [];
    const verification = await resolveVerification(node, {
      evidence,
      isExcluded: isNodeExcluded(ignoreReader, node),
      resolveOutcome,
    });
    const statusPath = nodeStatusPath(productDir, node.id);
    liveStatusPaths.add(statusPath);
    await writeNodeStatus(statusPath, verification);
  }

  await removeStaleNodeStatusFiles(productDir, liveStatusPaths);
}

type VerificationInput = {
  readonly evidence: readonly SpecTreeEvidenceSourceEntry[];
  readonly isExcluded: boolean;
  readonly resolveOutcome: NodeOutcomeResolver;
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
  return createTestVerificationFromOutcomes(evidence, outcomes);
}

function createTestVerificationFromOutcomes(
  evidence: readonly SpecTreeEvidenceSourceEntry[],
  resolvedOutcomes: Readonly<Record<string, NodeStatusEvidenceOutcome>>,
): NodeStatusVerification {
  const outcomes: Record<string, NodeStatusEvidenceOutcome> = {};
  for (const entry of evidence) {
    const path = evidencePath(entry);
    outcomes[path] = resolvedOutcomes[path] ?? NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN;
  }
  return { [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: createNodeStatusMechanismRecord(outcomes) };
}

function evidencePaths(evidence: readonly SpecTreeEvidenceSourceEntry[]): readonly string[] {
  return evidence.map(evidencePath);
}

function evidencePath(entry: SpecTreeEvidenceSourceEntry): string {
  return entry.ref?.path ?? entry.id;
}

function isNodeExcluded(ignoreReader: ReturnType<typeof createIgnoreSourceReader>, node: SpecTreeNode): boolean {
  const reference = node.ref?.path;
  if (reference === undefined) return false;
  return ignoreReader.isUnderIgnoreSource(reference);
}

async function writeNodeStatus(
  filePath: string,
  verification: NodeStatusVerification,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, serializeNodeStatus(createNodeStatusFile(verification)), NODE_STATUS_TEXT_ENCODING);
}

function nodeStatusPath(productDir: string, nodeId: string): string {
  return join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, nodeId, NODE_STATUS_FILENAME);
}

async function removeStaleNodeStatusFiles(
  productDir: string,
  liveStatusPaths: ReadonlySet<string>,
): Promise<void> {
  const statusPaths = await collectNodeStatusFiles(join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY));
  await Promise.all(statusPaths.filter((path) => !liveStatusPaths.has(path)).map((path) => rm(path, { force: true })));
}

async function collectNodeStatusFiles(directory: string): Promise<readonly string[]> {
  const entries = await readDirectoryEntries(directory);

  const statusPaths: string[] = [];
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      statusPaths.push(...await collectNodeStatusFiles(entryPath));
    } else if (entry.isFile() && entry.name === NODE_STATUS_FILENAME) {
      statusPaths.push(entryPath);
    }
  }
  return statusPaths;
}

async function readDirectoryEntries(directory: string): Promise<readonly Dirent<string>[]> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
