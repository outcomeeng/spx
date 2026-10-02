import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { statusCommand } from "@/commands/spec/status";
import { runTestsCommand } from "@/commands/test";
import { NODE_STATUS_EVIDENCE_OUTCOME } from "@/lib/node-status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { testingRegistry } from "@/test/registry";
import { testingRunsDir } from "@/test/run-state";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import {
  addNodeTestFile,
  fixtureNodePath,
  readRecordedStatusFile,
  readRecordedStatusState,
  recordedEvidenceResolverFor,
} from "@testing/harnesses/spec-tree/spec-cli-commands";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

describe("spx spec status --update recorded-evidence mapping", () => {
  it("maps an uncovered reference to not-run and executes no verification", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = fixtureNodePath(env.fixture.root);
      const rootTestFile = await addNodeTestFile(env, rootPath);

      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordedEvidenceResolverFor });

      expect(existsSync(testingRunsDir(env.productDir))).toBe(false);
      expect((await readRecordedStatusFile(env, rootPath))?.verification.test?.[rootTestFile]).toBe(
        NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN,
      );
    });
  });

  it("maps fresh covered passing evidence to passed without executing another run", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = fixtureNodePath(env.fixture.root);
      const rootTestFile = await addNodeTestFile(env, rootPath);
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

      await runTestsCommand(
        { productDir: env.productDir, passing: false },
        { registry: testingRegistry, runnerDepsFor: () => runner },
      );
      const callCount = runner.calls.length;

      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordedEvidenceResolverFor });

      expect(runner.calls).toHaveLength(callCount);
      expect((await readRecordedStatusFile(env, rootPath))?.verification.test?.[rootTestFile]).toBe(
        NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
      );
      expect(await readRecordedStatusState(env, rootPath)).toBe(SPEC_TREE_NODE_STATE.PASSING);
    });
  });

  it("maps fresh covered failing evidence to failed without executing another run", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = fixtureNodePath(env.fixture.root);
      const rootTestFile = await addNodeTestFile(env, rootPath);
      const runner = createRecordingCommandRunner({
        present: true,
        exitCode: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode()),
      });

      await runTestsCommand(
        { productDir: env.productDir, passing: false },
        { registry: testingRegistry, runnerDepsFor: () => runner },
      );
      const callCount = runner.calls.length;

      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordedEvidenceResolverFor });

      expect(runner.calls).toHaveLength(callCount);
      expect((await readRecordedStatusFile(env, rootPath))?.verification.test?.[rootTestFile]).toBe(
        NODE_STATUS_EVIDENCE_OUTCOME.FAILED,
      );
    });
  });

  it("keeps the committed outcome of a covered reference whose recorded evidence is stale, though the stale run reported another", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = fixtureNodePath(env.fixture.root);
      const rootTestFile = await addNodeTestFile(env, rootPath);

      // The committed claim records a failure ...
      await statusCommand({
        cwd: env.productDir,
        update: true,
        resolveOutcomeFor: () => (_nodeId, evidencePaths) =>
          Promise.resolve(Object.fromEntries(evidencePaths.map((path) => [path, NODE_STATUS_EVIDENCE_OUTCOME.FAILED]))),
      });
      // ... while the recorded run that covers the reference passed, and the
      // test file then changes, so that run's evidence is stale.
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await runTestsCommand(
        { productDir: env.productDir, passing: false },
        { registry: testingRegistry, runnerDepsFor: () => runner },
      );
      await env.writeRaw(rootTestFile, sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()));

      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordedEvidenceResolverFor });

      expect((await readRecordedStatusFile(env, rootPath))?.verification.test?.[rootTestFile]).toBe(
        NODE_STATUS_EVIDENCE_OUTCOME.FAILED,
      );
    });
  });

  it("folds covered references and maps only uncovered references to not-run", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = fixtureNodePath(env.fixture.root);
      const coveredTestFile = await addNodeTestFile(env, rootPath);
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

      await runTestsCommand(
        { productDir: env.productDir, passing: false },
        { registry: testingRegistry, runnerDepsFor: () => runner },
      );
      const uncoveredTestFile = await addNodeTestFile(env, rootPath);

      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordedEvidenceResolverFor });

      const recorded = await readRecordedStatusFile(env, rootPath);
      expect(recorded?.verification.test?.[coveredTestFile]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.PASSED);
      expect(recorded?.verification.test?.[uncoveredTestFile]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
      expect(await readRecordedStatusState(env, rootPath)).toBe(SPEC_TREE_NODE_STATE.FAILING);
    });
  });
});
