import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createNodeOutcomeResolver } from "@/commands/spec/node-outcome-resolver";
import { statusCommand } from "@/commands/spec/status";
import { NODE_STATUS_EVIDENCE_OUTCOME, NODE_STATUS_FILENAME, type NodeStatusFile } from "@/lib/node-status";
import { getKindDefinition, SPEC_TREE_EVIDENCE_FILE, SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { type NodeKind, SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { testingRegistry } from "@/test/registry";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { type CurrentSpecTreeEnv, withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  repoRootedCommandRunner,
  VITEST_FIXTURE,
  type VitestFixture,
  writeVitestFixture,
} from "@testing/harnesses/testing/typescript-runner";

describe("spx spec status --update production test execution", () => {
  it("records passing and failing node outcomes through the real TypeScript runner", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = formatNodePath(env.fixture.root.order, env.fixture.root.slug, env.fixture.root.kind);
      const peerPath = formatNodePath(env.fixture.peer.order, env.fixture.peer.slug, env.fixture.peer.kind);
      const passingTestFile = await addNodeVitestFixture(env, rootPath, VITEST_FIXTURE.PASSING);
      const failingTestFile = await addNodeVitestFixture(env, peerPath, VITEST_FIXTURE.FAILING);

      const output = await statusCommand({
        cwd: env.productDir,
        update: true,
        resolveOutcomeFor: (productDir) =>
          createNodeOutcomeResolver({
            productDir,
            registry: testingRegistry,
            runnerDepsFor: (language) => {
              expect(language.name).toBe(typescriptTestingLanguage.name);
              return repoRootedCommandRunner();
            },
          }),
      });

      expect(output).toContain(`${rootPath} [${SPEC_TREE_NODE_STATE.PASSING}]`);
      expect(output).toContain(`${peerPath} [${SPEC_TREE_NODE_STATE.FAILING}]`);
      await expect(readRecordedStatusFile(env, rootPath)).resolves.toMatchObject({
        verification: {
          test: {
            [passingTestFile]: NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
          },
        },
      });
      await expect(readRecordedStatusFile(env, peerPath)).resolves.toMatchObject({
        verification: {
          test: {
            [failingTestFile]: NODE_STATUS_EVIDENCE_OUTCOME.FAILED,
          },
        },
      });
    });
  });
});

async function addNodeVitestFixture(
  env: CurrentSpecTreeEnv,
  nodePath: string,
  fixture: VitestFixture,
): Promise<string> {
  const [mode] = SPEC_TREE_EVIDENCE_FILE.MODES;
  const [level] = SPEC_TREE_EVIDENCE_FILE.LEVELS;
  const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
  const tail = SPEC_TREE_EVIDENCE_FILE.TAILS.TYPESCRIPT.join(SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR);
  const evidenceFile = [
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    nodePath,
    SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME,
    `${slug}.${mode}.${level}.${tail}`,
  ].join("/");
  await writeVitestFixture(env.productDir, evidenceFile, fixture);
  return evidenceFile;
}

async function readRecordedStatusFile(env: CurrentSpecTreeEnv, nodePath: string): Promise<NodeStatusFile> {
  const statusPath = [SPEC_TREE_CONFIG.ROOT_DIRECTORY, nodePath, NODE_STATUS_FILENAME].join("/");
  expect(existsSync(join(env.productDir, statusPath))).toBe(true);
  return JSON.parse(await env.readFile(statusPath)) as NodeStatusFile;
}

function formatNodePath(order: number, slug: string, kind: NodeKind): string {
  return `${order}-${slug}${getKindDefinition(kind).suffix}`;
}
