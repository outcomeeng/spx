import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { statusCommand } from "@/commands/spec/status";
import { runTestsCommand } from "@/commands/test";
import { NODE_STATUS_EVIDENCE_OUTCOME } from "@/lib/node-status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { testingRegistry } from "@/test/registry";
import { TEST_PATH_VERDICT, testingRunsDir } from "@/test/run-state";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import {
  addNodeTestFile,
  changeNodeEvidenceContent,
  fixtureNodePath,
  readRecordedStatusFile,
  readRecordedStatusState,
  recordedEvidenceResolverFor,
  uniformOutcomeResolverFor,
} from "@testing/harnesses/spec-tree/spec-cli-commands";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { createRecordingCommandRunner, SIMULATED_REPORT } from "@testing/harnesses/testing/typescript-runner";

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
        resolveOutcomeFor: uniformOutcomeResolverFor(NODE_STATUS_EVIDENCE_OUTCOME.FAILED),
      });
      // ... while the recorded run that covers the reference passed, and the
      // test file then changes, so that run's evidence is stale.
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await runTestsCommand(
        { productDir: env.productDir, passing: false },
        { registry: testingRegistry, runnerDepsFor: () => runner },
      );
      await changeNodeEvidenceContent(env, rootTestFile);

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

  it("maps each covered reference to its own file's verdict when one run covers a failing and a passing file", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = fixtureNodePath(env.fixture.root);
      const failingTestFile = await addNodeTestFile(env, rootPath);
      const passingTestFile = await addNodeTestFile(env, rootPath);
      const runner = createRecordingCommandRunner({
        present: true,
        exitCode: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode()),
        reportedStatuses: new Map([
          [failingTestFile, TEST_PATH_VERDICT.FAILED],
          [passingTestFile, TEST_PATH_VERDICT.PASSED],
        ]),
      });

      await runTestsCommand(
        { productDir: env.productDir, passing: false },
        { registry: testingRegistry, runnerDepsFor: () => runner },
      );

      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordedEvidenceResolverFor });

      const recorded = await readRecordedStatusFile(env, rootPath);
      expect(recorded?.verification.test?.[failingTestFile]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.FAILED);
      expect(recorded?.verification.test?.[passingTestFile]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.PASSED);
    });
  });

  it("maps a covered reference whose own recorded verdict is not-run to not-run beside a passing covered file", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = fixtureNodePath(env.fixture.root);
      const unreportedTestFile = await addNodeTestFile(env, rootPath);
      const passingTestFile = await addNodeTestFile(env, rootPath);
      const runner = createRecordingCommandRunner({
        present: true,
        exitCode: 0,
        report: SIMULATED_REPORT.LISTED_FILES,
        reportedStatuses: new Map([[passingTestFile, TEST_PATH_VERDICT.PASSED]]),
      });

      await runTestsCommand(
        { productDir: env.productDir, passing: false },
        { registry: testingRegistry, runnerDepsFor: () => runner },
      );

      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordedEvidenceResolverFor });

      const recorded = await readRecordedStatusFile(env, rootPath);
      expect(recorded?.verification.test?.[unreportedTestFile]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
      expect(recorded?.verification.test?.[passingTestFile]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.PASSED);
    });
  });
});
