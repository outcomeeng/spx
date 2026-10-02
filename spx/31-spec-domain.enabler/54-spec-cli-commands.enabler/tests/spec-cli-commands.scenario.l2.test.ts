import { describe, expect, it } from "vitest";

import { statusCommand } from "@/commands/spec/status";
import { runTestsCommand } from "@/commands/test";
import { NODE_STATUS_EVIDENCE_OUTCOME } from "@/lib/node-status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { testingRegistry } from "@/test/registry";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  addNodeVitestFixture,
  fixtureNodePath,
  readRecordedStatusFile,
  recordedEvidenceResolverFor,
} from "@testing/harnesses/spec-tree/spec-cli-commands";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  createRepoRootedRecordingCommandRunner,
  VITEST_FIXTURE,
} from "@testing/harnesses/testing/typescript-runner";

describe("spx spec status --update over a real TypeScript run", () => {
  it("reports and records the rollup a prior real run produced, executing no further verification", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = fixtureNodePath(env.fixture.root);
      const passingTestFile = await addNodeVitestFixture(env, rootPath, VITEST_FIXTURE.PASSING);
      const runner = createRepoRootedRecordingCommandRunner();

      await runTestsCommand(
        { productDir: env.productDir, passing: false },
        { registry: testingRegistry, runnerDepsFor: () => runner },
      );
      const verificationCallCount = runner.calls.length;

      const updateOutput = await statusCommand({
        cwd: env.productDir,
        update: true,
        resolveOutcomeFor: recordedEvidenceResolverFor,
      });

      expect(runner.calls).toHaveLength(verificationCallCount);
      expect(updateOutput).toContain(`${rootPath} [${SPEC_TREE_NODE_STATE.PASSING}]`);
      expect(updateOutput).toBe(await statusCommand({ cwd: env.productDir }));
      expect((await readRecordedStatusFile(env, rootPath))?.verification.test?.[passingTestFile]).toBe(
        NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
      );
    });
  });
});
