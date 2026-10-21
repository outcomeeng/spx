import { describe, expect, it } from "vitest";

import { SPEC_STATUS_CHECK_MESSAGE, statusCommand } from "@/commands/spec/status";
import { SPEC_DOMAIN_CLI } from "@/interfaces/cli/spec";
import { NODE_STATUS_CLAIM_DIFFERENCE, NODE_STATUS_EVIDENCE_OUTCOME } from "@/lib/node-status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  currentMethodologyConfig,
  readNodeStatusFileBytes,
  withPinnedNodeRepository,
} from "@testing/harnesses/node-status/node-status";
import {
  addNodeVitestFixture,
  fixtureNodePath,
  readRecordedStatusFile,
  recordedEvidenceResolverFor,
  recordTestingRun,
} from "@testing/harnesses/spec-tree/spec-cli-commands";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  commitBuiltProjection,
  commitDriftedClaim,
  commitRepinnedClaim,
  runBuiltSpecStatus,
} from "@testing/harnesses/spec-tree/status-check-process";
import { createRepoRootedRecordingCommandRunner, VITEST_FIXTURE } from "@testing/harnesses/testing/typescript-runner";

describe("spx spec status --update over a real TypeScript run", () => {
  it("reports and records the rollup a prior real run produced, executing no further verification", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = fixtureNodePath(env.fixture.root);
      const passingTestFile = await addNodeVitestFixture(env, rootPath, VITEST_FIXTURE.PASSING);
      const runner = createRepoRootedRecordingCommandRunner();

      await recordTestingRun(env.productDir, runner);
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

describe("spx spec status --update --check through the built executable", () => {
  it("exits non-zero, reports each differing node and entry on the error stream, and writes nothing when committed claims differ from the projection", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    const drift = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.committedClaimDrift());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      const projected = await commitBuiltProjection(repository);
      const { verdictKey, readKey } = await commitDriftedClaim(repository, projected, drift);
      const before = await readNodeStatusFileBytes(repository.env.productDir);

      const run = await runBuiltSpecStatus(repository.env.productDir, [
        SPEC_DOMAIN_CLI.UPDATE_OPTION,
        SPEC_DOMAIN_CLI.CHECK_OPTION,
      ]);

      expect(run.exitCode).not.toBe(0);
      for (
        const reported of [
          SPEC_STATUS_CHECK_MESSAGE.DIFFERENCES,
          repository.nodeId,
          verdictKey,
          readKey,
          ...Object.values(NODE_STATUS_CLAIM_DIFFERENCE),
        ]
      ) {
        expect(run.stderr).toContain(reported);
      }
      expect(await readNodeStatusFileBytes(repository.env.productDir)).toEqual(before);
    });
  });

  it("exits zero, reports nothing, and writes nothing when committed claims differ from the projection only in pin commits", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      const projected = await commitBuiltProjection(repository);
      const projectedBytes = await readNodeStatusFileBytes(repository.env.productDir);
      await commitRepinnedClaim(repository, projected);
      const before = await readNodeStatusFileBytes(repository.env.productDir);
      // Re-pinning must change the committed bytes, or the case would compare identical claims.
      expect(before).not.toEqual(projectedBytes);

      const run = await runBuiltSpecStatus(repository.env.productDir, [
        SPEC_DOMAIN_CLI.UPDATE_OPTION,
        SPEC_DOMAIN_CLI.CHECK_OPTION,
      ]);

      expect(run.exitCode, run.stderr).toBe(0);
      expect(run.stderr).toHaveLength(0);
      expect(run.stdout).toHaveLength(0);
      expect(await readNodeStatusFileBytes(repository.env.productDir)).toEqual(before);
    });
  });

  it("rejects --check without --update with a non-zero exit and writes nothing", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      await repository.recordPassingClaim();
      const before = await readNodeStatusFileBytes(repository.env.productDir);

      const run = await runBuiltSpecStatus(repository.env.productDir, [SPEC_DOMAIN_CLI.CHECK_OPTION]);

      expect(run.exitCode).not.toBe(0);
      expect(run.stderr).toContain(SPEC_DOMAIN_CLI.CHECK_OPTION);
      expect(run.stderr).toContain(SPEC_DOMAIN_CLI.UPDATE_OPTION);
      expect(await readNodeStatusFileBytes(repository.env.productDir)).toEqual(before);
    });
  });
});
