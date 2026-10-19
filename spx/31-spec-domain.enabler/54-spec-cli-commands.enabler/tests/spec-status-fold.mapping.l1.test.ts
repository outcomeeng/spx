import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { statusCommand } from "@/commands/spec/status";
import {
  NODE_STATUS_CLAIM_FIELD,
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_CLAIM_SHAPE,
  NODE_STATUS_EVIDENCE_OUTCOME,
  readNodeStatus,
} from "@/lib/node-status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { TEST_PATH_VERDICT, testingRunsDir } from "@/test/run-state";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { currentMethodologyConfig, withPinnedNodeRepository } from "@testing/harnesses/node-status/node-status";
import {
  addNodeTestFile,
  changeNodeEvidenceContent,
  fixtureNodePath,
  readRecordedStatusFile,
  readRecordedStatusState,
  recordedEvidenceResolverFor,
  recordTestingRun,
  recordTestingRunReporting,
  uniformOutcomeResolverFor,
} from "@testing/harnesses/spec-tree/spec-cli-commands";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { SIMULATED_REPORT } from "@testing/harnesses/testing/simulated-report";
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

      await recordTestingRun(env.productDir, runner);
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

      await recordTestingRun(env.productDir, runner);
      const callCount = runner.calls.length;

      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordedEvidenceResolverFor });

      expect(runner.calls).toHaveLength(callCount);
      expect((await readRecordedStatusFile(env, rootPath))?.verification.test?.[rootTestFile]).toBe(
        NODE_STATUS_EVIDENCE_OUTCOME.FAILED,
      );
    });
  });

  for (const committed of Object.values(NODE_STATUS_EVIDENCE_OUTCOME)) {
    for (const staleVerdict of Object.values(TEST_PATH_VERDICT)) {
      it(`keeps a committed ${committed} outcome of a covered reference whose stale recorded run reported ${staleVerdict}`, async () => {
        await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
          await env.materialize();
          const rootPath = fixtureNodePath(env.fixture.root);
          const rootTestFile = await addNodeTestFile(env, rootPath);

          await statusCommand({
            cwd: env.productDir,
            update: true,
            resolveOutcomeFor: uniformOutcomeResolverFor(committed),
          });
          await recordTestingRunReporting(env.productDir, rootTestFile, staleVerdict);
          await changeNodeEvidenceContent(env, rootTestFile);

          await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordedEvidenceResolverFor });

          expect((await readRecordedStatusFile(env, rootPath))?.verification.test?.[rootTestFile]).toBe(committed);
        });
      });
    }
  }

  it("keeps the committed entry with its pin, commit and read paths included, of a covered reference whose recorded evidence is stale", async () => {
    const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
    const committedVerdict = sampleGeneratedValue(
      NODE_STATUS_TEST_GENERATOR.contradictingEvidenceOutcome(NODE_STATUS_EVIDENCE_OUTCOME.PASSED),
    );
    await withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
      const [testPath = ""] = repository.testPaths;
      const [testKey = ""] = repository.testKeys;
      const committedEntry = {
        ...repository.passedEntry([repository.specPath, testPath, repository.subjectPaths[0] ?? ""]),
        [NODE_STATUS_CLAIM_FIELD.VERDICT]: committedVerdict,
      };
      await repository.writeClaim({ [NODE_STATUS_CLAIM_SECTION.TEST]: { [testKey]: committedEntry } });
      await repository.commitAll();
      // The recorded run that covers the reference passed, and the test file then
      // changes, so that run's evidence is stale.
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      await recordTestingRun(repository.env.productDir, runner);
      await changeNodeEvidenceContent(repository.env, testPath);

      await statusCommand({
        cwd: repository.env.productDir,
        gitDependencies: repository.git,
        update: true,
        resolveOutcomeFor: recordedEvidenceResolverFor,
      });

      const written = readNodeStatus(join(repository.env.productDir, repository.nodePath));
      expect(written?.shape).toBe(NODE_STATUS_CLAIM_SHAPE.CURRENT);
      if (written?.shape !== NODE_STATUS_CLAIM_SHAPE.CURRENT) return;
      expect(written.claim[NODE_STATUS_CLAIM_FIELD.VERIFICATION][NODE_STATUS_CLAIM_SECTION.TEST]?.[testKey]).toEqual(
        committedEntry,
      );
    });
  });

  it("folds covered references and maps only uncovered references to not-run", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();
      const rootPath = fixtureNodePath(env.fixture.root);
      const coveredTestFile = await addNodeTestFile(env, rootPath);
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

      await recordTestingRun(env.productDir, runner);
      const uncoveredTestFile = await addNodeTestFile(env, rootPath, 1);

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
      const passingTestFile = await addNodeTestFile(env, rootPath, 1);
      const runner = createRecordingCommandRunner({
        present: true,
        exitCode: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode()),
        reportedStatuses: new Map([
          [failingTestFile, TEST_PATH_VERDICT.FAILED],
          [passingTestFile, TEST_PATH_VERDICT.PASSED],
        ]),
      });

      await recordTestingRun(env.productDir, runner);

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
      const passingTestFile = await addNodeTestFile(env, rootPath, 1);
      const runner = createRecordingCommandRunner({
        present: true,
        exitCode: 0,
        report: SIMULATED_REPORT.LISTED_FILES,
        reportedStatuses: new Map([[passingTestFile, TEST_PATH_VERDICT.PASSED]]),
      });

      await recordTestingRun(env.productDir, runner);

      await statusCommand({ cwd: env.productDir, update: true, resolveOutcomeFor: recordedEvidenceResolverFor });

      const recorded = await readRecordedStatusFile(env, rootPath);
      expect(recorded?.verification.test?.[unreportedTestFile]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN);
      expect(recorded?.verification.test?.[passingTestFile]).toBe(NODE_STATUS_EVIDENCE_OUTCOME.PASSED);
    });
  });
});
