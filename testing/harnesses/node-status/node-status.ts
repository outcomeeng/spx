import { IGNORE_SOURCE_FILENAME_DEFAULT } from "@/lib/file-inclusion/ignore-source";
import { classifyNodeStatus, NODE_STATUS_FILENAME, type NodeClassificationFacts } from "@/lib/node-status";
import { SPEC_TREE_CONFIG, type SpecTreeNodeState } from "@/lib/spec-tree/config";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import type { ClassificationTreeFixture } from "@testing/generators/node-status/node-status";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { type SpecTreeEnv, withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

const ROOT = SPEC_TREE_CONFIG.ROOT_DIRECTORY;
const EVIDENCE_DIRECTORY = "tests";

const SPEC_CONTENT = "# Fixture\n\nPROVIDES fixture infrastructure\nSO THAT node-status tests\nCAN classify nodes\n";
const EVIDENCE_CONTENT =
  "import { expect, it } from \"vitest\";\n\nit(\"holds\", () => {\n  expect(true).toBe(true);\n});\n";

export type ClassificationTreeNodeExpectation = {
  readonly nodeId: string;
  readonly slug: string;
  readonly facts: NodeClassificationFacts;
  readonly statusPath: string;
  readonly expectedStatus: SpecTreeNodeState;
};

export type ClassificationTreeEnv = {
  readonly env: SpecTreeEnv;
  readonly expectations: readonly ClassificationTreeNodeExpectation[];
  resolveOutcome(nodeId: string): Promise<boolean>;
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
      await env.writeNode(`${ROOT}/${node.dirName}/${node.slug}.md`, SPEC_CONTENT);

      if (node.facts.hasTests) {
        const evidenceFileName = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.evidenceFileName());
        await env.writeNode(`${ROOT}/${node.dirName}/${EVIDENCE_DIRECTORY}/${evidenceFileName}`, EVIDENCE_CONTENT);
      }

      if (node.facts.isExcluded) {
        excludedDirs.push(node.dirName);
      }

      expectations.push({
        nodeId: node.dirName,
        slug: node.slug,
        facts: node.facts,
        statusPath: `${ROOT}/${node.dirName}/${NODE_STATUS_FILENAME}`,
        expectedStatus: classifyNodeStatus(node.facts),
      });
    }

    if (excludedDirs.length > 0) {
      await env.writeRaw(`${ROOT}/${IGNORE_SOURCE_FILENAME_DEFAULT}`, `${excludedDirs.join("\n")}\n`);
    }

    const factsByNodeId = new Map(expectations.map((expectation) => [expectation.nodeId, expectation.facts]));

    await callback({
      env,
      expectations,
      resolveOutcome: (nodeId: string) => Promise.resolve(factsByNodeId.get(nodeId)?.testsPass ?? false),
    });
  });
}
