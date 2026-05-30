import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createIgnoreSourceReader, IGNORE_SOURCE_FILENAME_DEFAULT } from "@/lib/file-inclusion/ignore-source";
import {
  createFilesystemSpecTreeSource,
  readSpecTree,
  SPEC_TREE_ENTRY_TYPE,
  type SpecTreeNode,
  type SpecTreeSnapshot,
} from "@/lib/spec-tree";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { classifyNodeStatus, type NodeClassificationFacts, serializeNodeStatus } from "./classify";
import { NODE_STATUS_FILENAME } from "./read";

/**
 * Execute a node's test suite and report whether every test passed.
 *
 * Injected so the classifier's precedence logic is verifiable without running a
 * real suite.
 */
export type NodeTestRunner = (nodeId: string) => Promise<boolean>;

export interface UpdateNodeStatusOptions {
  readonly productDir: string;
  readonly runNodeTests: NodeTestRunner;
}

const NODE_STATUS_TEXT_ENCODING = "utf8";

/**
 * Classify every spec-tree node under `productDir` and write its lifecycle state
 * to a co-located `spx.status.json`. This is the only path that writes the file.
 */
export async function updateNodeStatus(options: UpdateNodeStatusOptions): Promise<void> {
  const { productDir, runNodeTests } = options;
  const snapshot = await readSpecTree({ source: createFilesystemSpecTreeSource({ productDir }) });
  const ignoreReader = createIgnoreSourceReader(productDir, {
    ignoreSourceFilename: IGNORE_SOURCE_FILENAME_DEFAULT,
    specTreeRootSegment: SPEC_TREE_CONFIG.ROOT_DIRECTORY,
  });
  const nodesWithTests = collectNodesWithTests(snapshot);

  for (const node of snapshot.allNodes) {
    const facts = await classifyFacts(node, {
      hasTests: nodesWithTests.has(node.id),
      isExcluded: isNodeExcluded(ignoreReader, node),
      runNodeTests,
    });
    await writeNodeStatus(productDir, node.id, classifyNodeStatus(facts));
  }
}

type ClassifyFactsInput = {
  readonly hasTests: boolean;
  readonly isExcluded: boolean;
  readonly runNodeTests: NodeTestRunner;
};

async function classifyFacts(node: SpecTreeNode, input: ClassifyFactsInput): Promise<NodeClassificationFacts> {
  // Tests are only executed when their outcome can change the classification —
  // a node with no tests is declared, and an excluded node is specified, before
  // any test outcome is consulted.
  const testsPass = input.hasTests && !input.isExcluded ? await input.runNodeTests(node.id) : false;
  return { hasTests: input.hasTests, isExcluded: input.isExcluded, testsPass };
}

function collectNodesWithTests(snapshot: SpecTreeSnapshot): ReadonlySet<string> {
  const parents = new Set<string>();
  for (const entry of snapshot.entries) {
    if (entry.type === SPEC_TREE_ENTRY_TYPE.EVIDENCE) {
      parents.add(entry.parentId);
    }
  }
  return parents;
}

function isNodeExcluded(ignoreReader: ReturnType<typeof createIgnoreSourceReader>, node: SpecTreeNode): boolean {
  const reference = node.ref?.path;
  if (reference === undefined) return false;
  return ignoreReader.isUnderIgnoreSource(reference);
}

async function writeNodeStatus(
  productDir: string,
  nodeId: string,
  state: ReturnType<typeof classifyNodeStatus>,
): Promise<void> {
  const filePath = join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, nodeId, NODE_STATUS_FILENAME);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, serializeNodeStatus(state), NODE_STATUS_TEXT_ENCODING);
}
