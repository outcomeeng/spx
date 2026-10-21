/**
 * Harness that records sealed `test` run journals the way a verification run records them and drives a real
 * Vitest run to produce the evidence such a journal carries, so the production status resolvers read a journal
 * rather than a double of one.
 *
 * @module testing/harnesses/testing/status-journal
 */
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { appendJournalEvent, openJournalRun, sealJournalRun } from "@/commands/journal/runtime";
import { createNodeStatusResolvers, type NodeStatusResolvers } from "@/commands/spec/node-status-resolvers";
import { recorderTerminalStatusFor } from "@/commands/verification-exec/executor";
import { JOURNAL_RUN_STATE_STATUS, type JournalRunStateStatus } from "@/domains/journal/run-state";
import {
  buildAppendEvent,
  buildRunContextEvent,
  buildTerminalEvent,
  TEST_PAYLOAD_FIELD,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_DRIVE_MODE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { resolveVerificationBranchSlug } from "@/lib/state-store";
import {
  createVitestRunStarter,
  productVitestNodeApiLoader,
  runTestsStreaming,
} from "@/test/languages/journal-reporter";
import type { TestFinding, TestScopeUnit } from "@/test/languages/types";
import { testingRegistry } from "@/test/registry";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { NODE_STATUS_TEST_GENERATOR } from "@testing/generators/node-status/node-status";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { RecordingJournalStreamSink } from "@testing/harnesses/journal/harness";
import {
  currentMethodologyConfig,
  type PinnedNodeRepository,
  withPinnedNodeRepository,
} from "@testing/harnesses/node-status/node-status";
import { createRecordingEvidenceSink, linkProductRunnerToolchain } from "@testing/harnesses/testing/journal-reporter";

const VITEST_FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "vitest");

/** The committed inert Vitest suites a real run is driven over. */
export const REAL_RUN_FIXTURE = {
  PASSING: "passing.test.ts.fixture",
  IMPORTS_MISSING_FILE: "imports-missing-file.test.ts.fixture",
} as const;

export type RealRunFixture = (typeof REAL_RUN_FIXTURE)[keyof typeof REAL_RUN_FIXTURE];

/** What a sealed `test` run journal records: the commit it judged, the modules it covered, the findings, and how it ended. */
export interface TestJournalRecord {
  /** The head commit the run recorded; absent when the run recorded none. */
  readonly headCommit: string | undefined;
  readonly scopes: readonly TestScopeUnit[];
  readonly findings: readonly TestFinding[];
  readonly terminalStatus: JournalRunStateStatus;
  /** The moment the run opened, which orders it among the product's runs. */
  readonly at: Date;
}

/** The scope slug a verification run records under for the branch checked out in `productDir`. */
function checkedOutBranchSlug(productDir: string): Promise<string> {
  return resolveVerificationBranchSlug({ cwd: productDir, isGitRepo: true });
}

/** A branch scope slug other than the one checked out in `productDir`. */
export function otherBranchSlug(): string {
  return sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchSlug());
}

/** Record `journal` as one sealed `test` run in the store of `productDir`. */
export async function recordSealedTestJournal(
  productDir: string,
  journal: TestJournalRecord,
  branchSlug?: string,
): Promise<void> {
  const scopeSlug = branchSlug ?? await checkedOutBranchSlug(productDir);
  const opened = await openJournalRun(
    { productDir, branchSlug: scopeSlug, type: VERIFY_VERIFICATION_TYPE.TEST },
    { now: () => journal.at },
  );
  if (!opened.ok) throw new Error(opened.error);
  const { ref } = opened.value;
  const sink = new RecordingJournalStreamSink();
  const events = [
    buildRunContextEvent({
      runToken: ref.runToken,
      driveMode: VERIFY_DRIVE_MODE.SPX,
      ...(journal.headCommit === undefined ? {} : { headCommit: journal.headCommit }),
      at: journal.at,
    }),
    ...journal.scopes.map((scope) =>
      buildAppendEvent({
        eventType: VERIFY_APPEND_EVENT_TYPE.SCOPE,
        idempotencyKey: scope.moduleId,
        payload: {
          [TEST_PAYLOAD_FIELD.MODULE_ID]: scope.moduleId,
          ...(scope.readPaths === undefined ? {} : { [TEST_PAYLOAD_FIELD.READ_PATHS]: [...scope.readPaths] }),
        },
        at: journal.at,
      })
    ),
    ...journal.findings.map((finding) =>
      buildAppendEvent({
        eventType: VERIFY_APPEND_EVENT_TYPE.FINDING,
        idempotencyKey: `${finding.moduleId}:${finding.testName}`,
        payload: {
          [TEST_PAYLOAD_FIELD.MODULE_ID]: finding.moduleId,
          [TEST_PAYLOAD_FIELD.TEST_NAME]: finding.testName,
          [TEST_PAYLOAD_FIELD.ERRORS]: [...finding.errors],
        },
        at: journal.at,
      })
    ),
    buildTerminalEvent({ runToken: ref.runToken, terminalStatus: journal.terminalStatus, at: journal.at }),
  ];
  for (const event of events) {
    const appended = await appendJournalEvent(ref, event, sink);
    if (!appended.ok) throw new Error(appended.error);
  }
  const sealed = await sealJournalRun(ref);
  if (!sealed.ok) throw new Error(sealed.error);
}

/** The terminal status a run that passed seals with. */
export const PASSED_TERMINAL_STATUS: JournalRunStateStatus = JOURNAL_RUN_STATE_STATUS.PASSED;

/** What a real Vitest run streamed and how it ended, in the recorder's vocabulary. */
export interface RealVitestRun {
  readonly scopes: readonly TestScopeUnit[];
  readonly findings: readonly TestFinding[];
  readonly terminalStatus: JournalRunStateStatus;
}

/** Copy each committed fixture suite over its product-relative path in `productDir`. */
export async function writeRealRunSuites(
  productDir: string,
  suites: ReadonlyMap<string, RealRunFixture>,
): Promise<void> {
  for (const [testPath, fixture] of suites) {
    await mkdir(dirname(join(productDir, testPath)), { recursive: true });
    await copyFile(join(VITEST_FIXTURE_DIR, fixture), join(productDir, testPath));
  }
}

/**
 * Link the repository's runner toolchain into `productDir` and drive a real programmatic Vitest run over
 * `testPaths` through the production starter.
 */
export async function runRealVitestOver(productDir: string, testPaths: readonly string[]): Promise<RealVitestRun> {
  await linkProductRunnerToolchain(productDir);
  const sink = createRecordingEvidenceSink();
  const outcome = await runTestsStreaming(
    { productDir, testPaths },
    { sink, starter: createVitestRunStarter(productVitestNodeApiLoader) },
  );
  if (!outcome.started) throw new Error(`no Vitest Node API resolved in ${outcome.unresolvedProductDir}`);
  return {
    scopes: sink.scopes,
    findings: sink.findings,
    terminalStatus: recorderTerminalStatusFor(outcome.terminalStatus),
  };
}

const NODE_RECORD_CLOCK_ORIGIN_MS = Date.UTC(2026, 0, 1);
const NODE_RECORD_CLOCK_STEP_MS = 1_000;

/** A committed single-node repository with the production status resolvers over the journals recorded in it. */
export interface JournaledNode {
  readonly repository: PinnedNodeRepository;
  readonly resolvers: NodeStatusResolvers;
  /** The module identity a run reports for a product-relative test path: the absolute path. */
  moduleIdOf(testPath: string): string;
  /** A failing case in the module of `testPath`, its name and messages drawn from a generator. */
  failingCaseIn(testPath: string): TestFinding;
  /** Record one sealed `test` run, later than every run recorded before it, in `branchSlug` or the checked-out branch's scope. */
  record(journal: Omit<TestJournalRecord, "at">, branchSlug?: string): Promise<void>;
}

/**
 * Commit a node repository whose spec links two tests, and hand back the production status resolvers
 * together with a recorder of sealed `test` run journals in it.
 */
export function withJournaledNode(callback: (node: JournaledNode) => Promise<void>): Promise<void> {
  const fixture = sampleGeneratedValue(NODE_STATUS_TEST_GENERATOR.pinnedNode());
  return withPinnedNodeRepository(fixture, currentMethodologyConfig(), async (repository) => {
    const { productDir } = repository.env;
    let recorded = 0;
    const moduleIdOf = (testPath: string): string => join(productDir, testPath);
    await callback({
      repository,
      resolvers: createNodeStatusResolvers({ productDir, registry: testingRegistry, git: repository.git }),
      moduleIdOf,
      failingCaseIn: (testPath) => ({
        moduleId: moduleIdOf(testPath),
        testName: sampleGeneratedValue(arbitraryDomainLiteral()),
        errors: [sampleGeneratedValue(arbitraryDomainLiteral())],
      }),
      record: (journal, branchSlug) => {
        recorded += 1;
        return recordSealedTestJournal(productDir, {
          ...journal,
          at: new Date(NODE_RECORD_CLOCK_ORIGIN_MS + recorded * NODE_RECORD_CLOCK_STEP_MS),
        }, branchSlug);
      },
    });
  });
}
