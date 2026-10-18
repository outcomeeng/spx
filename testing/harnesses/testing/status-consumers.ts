/**
 * Harness that records testing evidence the way the product records it and hands back the production
 * status resolvers that read it, so evidence reaches the status path's own consumers of the
 * language-neutral evidence contract rather than the contract's functions in isolation.
 *
 * @module testing/harnesses/testing/status-consumers
 */
import { appendJournalEvent, openJournalRun, sealJournalRun } from "@/commands/journal/runtime";
import { createNodeOutcomeResolver } from "@/commands/spec/node-outcome-resolver";
import { createNodeStatusResolvers } from "@/commands/spec/node-status-resolvers";
import { currentStalenessInputs } from "@/commands/test";
import {
  buildAppendEvent,
  buildRunContextEvent,
  TEST_PAYLOAD_FIELD,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_DRIVE_MODE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import type { NodeOutcomeResolver, NodeReadPathResolver } from "@/lib/node-status";
import { resolveVerificationBranchSlug } from "@/lib/state-store";
import { testingRegistry } from "@/test/registry";
import {
  createTestRunFile,
  formatTestRunTimestamp,
  type TestRunnerOutcome,
  type TestRunState,
  writeTerminalTestRunState,
} from "@/test/run-state";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleTestRunStateValue, TEST_RUN_STATE_TEST_GENERATOR } from "@testing/generators/testing/run-state";
import { RecordingJournalStreamSink } from "@testing/harnesses/journal/harness";
import { currentMethodologyConfig, withPinnedNodeRepository } from "@testing/harnesses/node-status/node-status";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { writeTestFileFixture } from "@testing/harnesses/testing/harness";

const RUN_CLOCK_ORIGIN_MS = Date.UTC(2026, 0, 1);
const RUN_CLOCK_STEP_MS = 1_000;

/** Records terminal test runs in a product directory and answers the production outcome resolver over them. */
export interface RecordedTestRuns {
  /** Record one terminal run whose runner outcomes are `outcomes`; a later record supersedes an earlier one it covers. */
  record(outcomes: readonly TestRunnerOutcome[]): Promise<void>;
  /** The production node-outcome resolver, built fresh over the runs recorded so far. */
  resolverOverRecordedRuns(): NodeOutcomeResolver;
}

/**
 * Materialize `evidencePaths` as test files in a temporary product directory and hand back a recorder
 * of terminal runs over them. Each run carries the staleness inputs the product computes for its
 * covered paths, so the production resolver treats it as fresh.
 */
export function withRecordedTestRuns(
  evidencePaths: readonly string[],
  callback: (runs: RecordedTestRuns) => Promise<void>,
): Promise<void> {
  return withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
    for (const evidencePath of evidencePaths) await writeTestFileFixture(env.productDir, evidencePath);
    let recorded = 0;
    await callback({
      record: async (outcomes) => {
        const covered = outcomes.flatMap((outcome) => outcome.testPaths);
        const inputs = await currentStalenessInputs(env.productDir, covered, { registry: testingRegistry });
        const base = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState());
        recorded += 1;
        const moment = formatTestRunTimestamp(new Date(RUN_CLOCK_ORIGIN_MS + recorded * RUN_CLOCK_STEP_MS));
        const state: TestRunState = {
          ...base,
          ...inputs,
          runnerOutcomes: outcomes,
          startedAt: moment,
          completedAt: moment,
        };
        const file = await createTestRunFile(env.productDir);
        if (!file.ok) throw new Error(file.error);
        const written = await writeTerminalTestRunState(file.value.runFilePath, state);
        if (!written.ok) throw new Error(written.error);
      },
      resolverOverRecordedRuns: () =>
        createNodeOutcomeResolver({ productDir: env.productDir, registry: testingRegistry }),
    });
  });
}

/** The production read-path resolver over a sealed test journal, with the paths the journal recorded for each module. */
export interface RecordedReadPaths {
  readonly resolveReadPaths: NodeReadPathResolver;
  /** The product-relative paths every recorded module read, all unchanged since the run's head commit. */
  readonly reportedReadPaths: readonly string[];
}

/**
 * Commit a node repository, seal a test run journal in it that records `evidencePaths` as modules each
 * reading the repository's committed source files, and hand back the production read-path resolver.
 */
export function withRecordedReadPaths(
  evidencePaths: readonly string[],
  callback: (read: RecordedReadPaths) => Promise<void>,
): Promise<void> {
  const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
  return withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
    const { productDir } = repository.env;
    const branchSlug = await resolveVerificationBranchSlug({ cwd: productDir, isGitRepo: true, git: repository.git });
    const at = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.timestampDate());
    const opened = await openJournalRun({ productDir, branchSlug, type: VERIFY_VERIFICATION_TYPE.TEST });
    if (!opened.ok) throw new Error(opened.error);
    const { ref } = opened.value;
    const sink = new RecordingJournalStreamSink();
    const events = [
      buildRunContextEvent({
        runToken: ref.runToken,
        driveMode: VERIFY_DRIVE_MODE.SPX,
        headCommit: repository.commit,
        at,
      }),
      ...evidencePaths.map((evidencePath) =>
        buildAppendEvent({
          eventType: VERIFY_APPEND_EVENT_TYPE.SCOPE,
          idempotencyKey: evidencePath,
          payload: {
            [TEST_PAYLOAD_FIELD.MODULE_ID]: evidencePath,
            [TEST_PAYLOAD_FIELD.READ_PATHS]: [...repository.subjectPaths],
          },
          at,
        })
      ),
    ];
    for (const event of events) {
      const appended = await appendJournalEvent(ref, event, sink);
      if (!appended.ok) throw new Error(appended.error);
    }
    const sealed = await sealJournalRun(ref);
    if (!sealed.ok) throw new Error(sealed.error);
    const { resolveReadPaths } = createNodeStatusResolvers({
      productDir,
      registry: testingRegistry,
      git: repository.git,
    });
    await callback({ resolveReadPaths, reportedReadPaths: repository.subjectPaths });
  });
}
