import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createNodeOutcomeResolver } from "@/commands/spec/node-outcome-resolver";
import { runNodeCommand } from "@/commands/test";
import { NODE_STATUS_EXCLUDE_FILENAME, NODE_STATUS_FILENAME, type NodeOutcomeResolver } from "@/lib/node-status";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { testingRegistry } from "@/test/registry";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  ClassificationFixtureFacts,
  ClassificationTreeFixture,
  NODE_STATUS_TEST_GENERATOR,
  sampleNodeStatusValue,
} from "@testing/generators/node-status/node-status";
import { type SpecTreeEnv, withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

const ROOT = SPEC_TREE_CONFIG.ROOT_DIRECTORY;
const NODE_STATUS_FIXTURE_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "node-status",
);
const CLASSIFICATION_SPEC_FIXTURE = "classification-spec.md.fixture";
const CLASSIFICATION_TEST_FIXTURE = "classification-test.ts.fixture";

export type ClassificationTreeNodeExpectation = {
  readonly nodeId: string;
  readonly slug: string;
  readonly facts: ClassificationFixtureFacts;
  readonly evidencePaths: readonly string[];
  readonly statusPath: string;
};

export type ClassificationTreeEnv = {
  readonly env: SpecTreeEnv;
  readonly expectations: readonly ClassificationTreeNodeExpectation[];
  recordOutcomeEvidence(): Promise<NodeOutcomeResolver>;
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
    const [specContent, testContent] = await Promise.all([
      readFixture(CLASSIFICATION_SPEC_FIXTURE),
      readFixture(CLASSIFICATION_TEST_FIXTURE),
    ]);
    const excludedDirs: string[] = [];
    const expectations: ClassificationTreeNodeExpectation[] = [];

    for (const node of fixture.nodes) {
      await env.writeNode(`${ROOT}/${node.dirName}/${node.slug}.md`, specContent);
      let evidencePath: string | undefined;

      if (node.facts.hasVerificationReferences) {
        const evidenceReference = sampleNodeStatusValue(NODE_STATUS_TEST_GENERATOR.statusReference());
        evidencePath = `${ROOT}/${node.dirName}/${evidenceReference}`;
        await env.writeNode(evidencePath, testContent);
      }

      if (node.facts.isExcluded) {
        excludedDirs.push(node.dirName);
      }

      expectations.push({
        nodeId: node.dirName,
        slug: node.slug,
        facts: node.facts,
        evidencePaths: evidencePath === undefined ? [] : [evidencePath],
        statusPath: `${ROOT}/${node.dirName}/${NODE_STATUS_FILENAME}`,
      });
    }

    if (excludedDirs.length > 0) {
      await env.writeRaw(`${ROOT}/${NODE_STATUS_EXCLUDE_FILENAME}`, `${excludedDirs.join("\n")}\n`);
    }

    await callback({
      env,
      expectations,
      recordOutcomeEvidence: async () => {
        for (const expectation of expectations) {
          if (!expectation.facts.hasVerificationReferences || expectation.facts.isExcluded) continue;
          await runNodeCommand(
            { productDir: env.productDir, nodePath: `${ROOT}/${expectation.nodeId}` },
            {
              registry: testingRegistry,
              runnerDepsFor: () =>
                createRecordingCommandRunner({
                  present: true,
                  exitCode: expectation.facts.runnerExitCode,
                }),
            },
          );
        }
        return createNodeOutcomeResolver({ productDir: env.productDir, registry: testingRegistry });
      },
    });
  });
}

function readFixture(filename: string): Promise<string> {
  return readFile(join(NODE_STATUS_FIXTURE_DIRECTORY, filename), "utf8");
}
