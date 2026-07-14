import {
  classifyNodeStatus,
  createNodeStatusFile,
  createNodeStatusMechanismRecord,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_EXCLUDE_FILENAME,
  NODE_STATUS_FILENAME,
  NODE_STATUS_VERIFICATION_MECHANISM,
  type NodeStatusEvidenceOutcome,
  type NodeStatusFile,
} from "@/lib/node-status";
import { SPEC_TREE_CONFIG, type SpecTreeNodeState } from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import type {
  ClassificationFixtureFacts,
  ClassificationTreeFixture,
} from "@testing/generators/node-status/node-status";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { type SpecTreeEnv, withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

const ROOT = SPEC_TREE_CONFIG.ROOT_DIRECTORY;
const EVIDENCE_DIRECTORY = "tests";

export const NODE_STATUS_CLASSIFICATION_SPEC_CONTENT =
  "# Fixture\n\nPROVIDES fixture infrastructure\nSO THAT node-status tests\nCAN classify nodes\n";
export const NODE_STATUS_CLASSIFICATION_EVIDENCE_CONTENT =
  "import { expect, it } from \"vitest\";\n\nit(\"holds\", () => {\n  expect(true).toBe(true);\n});\n";

export type ClassificationTreeNodeExpectation = {
  readonly nodeId: string;
  readonly slug: string;
  readonly facts: ClassificationFixtureFacts;
  readonly evidencePaths: readonly string[];
  readonly statusPath: string;
  readonly expectedStatusFile: NodeStatusFile;
  readonly expectedStatus: SpecTreeNodeState;
};

export type ClassificationTreeEnv = {
  readonly env: SpecTreeEnv;
  readonly expectations: readonly ClassificationTreeNodeExpectation[];
  resolveOutcome(
    nodeId: string,
    evidencePaths: readonly string[],
  ): Promise<Readonly<Record<string, NodeStatusEvidenceOutcome>>>;
};

// Materialize a generated classification tree into a temp product directory:
// each node becomes a directory with a spec file, optional co-located tests, and
// optional spx/EXCLUDE membership, exactly as the classification facts dictate.
// The temp directory is provisioned from the minimal spec-tree config, so the
// harness never reads the real repository's configuration.
export async function withClassificationTree(
  fixture: ClassificationTreeFixture,
  callback: (tree: ClassificationTreeEnv) => Promise<void>,
): Promise<void> {
  await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    const excludedDirs: string[] = [];
    const expectations: ClassificationTreeNodeExpectation[] = [];

    for (const node of fixture.nodes) {
      await env.writeNode(`${ROOT}/${node.dirName}/${node.slug}.md`, NODE_STATUS_CLASSIFICATION_SPEC_CONTENT);
      let evidencePath: string | undefined;

      if (node.facts.hasVerificationReferences) {
        const evidenceFileName = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.evidenceFileName());
        evidencePath = `${ROOT}/${node.dirName}/${EVIDENCE_DIRECTORY}/${evidenceFileName}`;
        await env.writeNode(evidencePath, NODE_STATUS_CLASSIFICATION_EVIDENCE_CONTENT);
      }

      if (node.facts.isExcluded) {
        excludedDirs.push(node.dirName);
      }

      const expectedStatusFile = expectedNodeStatusFile(node.facts, evidencePath);
      expectations.push({
        nodeId: node.dirName,
        slug: node.slug,
        facts: node.facts,
        evidencePaths: evidencePath === undefined ? [] : [evidencePath],
        statusPath: `${ROOT}/${node.dirName}/${NODE_STATUS_FILENAME}`,
        expectedStatusFile,
        expectedStatus: classifyNodeStatus({
          hasVerificationReferences: node.facts.hasVerificationReferences,
          isExcluded: node.facts.isExcluded,
          verification: expectedStatusFile.verification,
        }),
      });
    }

    if (excludedDirs.length > 0) {
      await env.writeRaw(`${ROOT}/${NODE_STATUS_EXCLUDE_FILENAME}`, `${excludedDirs.join("\n")}\n`);
    }

    const factsByNodeId = new Map(expectations.map((expectation) => [expectation.nodeId, expectation.facts]));

    await callback({
      env,
      expectations,
      resolveOutcome: (nodeId: string, evidencePaths: readonly string[]) =>
        Promise.resolve(
          Object.fromEntries(
            evidencePaths.map((path) => [
              path,
              factsByNodeId.get(nodeId)?.testsPass
                ? NODE_STATUS_EVIDENCE_OUTCOME.PASSED
                : NODE_STATUS_EVIDENCE_OUTCOME.FAILED,
            ]),
          ),
        ),
    });
  });
}

function expectedNodeStatusFile(facts: ClassificationFixtureFacts, evidencePath: string | undefined): NodeStatusFile {
  if (evidencePath === undefined) return createNodeStatusFile({});
  const outcome = expectedOutcomeFor(facts);
  return createNodeStatusFile({
    [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: createNodeStatusMechanismRecord({ [evidencePath]: outcome }),
  });
}

function expectedOutcomeFor(facts: ClassificationFixtureFacts): NodeStatusEvidenceOutcome {
  if (facts.isExcluded) return NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN;
  return facts.testsPass ? NODE_STATUS_EVIDENCE_OUTCOME.PASSED : NODE_STATUS_EVIDENCE_OUTCOME.FAILED;
}
