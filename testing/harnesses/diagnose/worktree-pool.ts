/**
 * Worktree-pool diagnose evidence harness.
 *
 * Owns generated inputs, temporary-repository setup, dependency injection, and
 * property replay policy so the co-located test files remain assertion-only.
 *
 * @module testing/harnesses/diagnose/worktree-pool
 */

import { join } from "node:path";

import fc from "fast-check";
import { expect } from "vitest";

import { gatherWorktreePoolSnapshot, worktreePoolReadingFromSnapshot } from "@/commands/diagnose/probes";
import {
  classifyWorktreePool,
  WORKTREE_POOL_VERDICT,
  type WorktreePoolReading,
  type WorktreePoolVerdict,
} from "@/domains/diagnose/checks/worktree-pool";
import { type CheckRecord, VERDICT_BUCKET } from "@/domains/diagnose/types";
import { writeClaim } from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import type { RandomBytes } from "@/lib/atomic-file-write";
import { GIT_DIR_BASENAME, GIT_URL_SUFFIX, type GitFacts } from "@/lib/git/root";
import { worktreesScopeDir } from "@/lib/state-store";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { arbitraryOriginUrl, sampleMainCheckoutTestValue } from "@testing/generators/main-checkout/main-checkout";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { createProcessTable } from "@testing/harnesses/worktree/harness";

interface WorktreePoolClassificationCase {
  readonly overrides: Partial<WorktreePoolReading>;
  readonly verdict: WorktreePoolVerdict;
  readonly bucket: CheckRecord["bucket"];
}

interface WorktreePoolPropertyInput {
  readonly worktreeNames: readonly [string, string, string];
  readonly sessionIds: readonly [string, string];
  readonly pids: readonly [number, number, number, number];
  readonly startTimes: readonly [string, string];
  readonly host: string;
  readonly randomBytesPair: readonly [RandomBytes, RandomBytes];
  readonly tempPrefix: string;
}

interface CanonicalStandingCase {
  readonly designated: boolean;
  readonly defaultBranchAvailable: boolean;
  readonly branchRead: boolean;
  readonly detached: boolean;
  readonly wrongBranch: boolean;
  readonly verdict: WorktreePoolVerdict;
  readonly bucket: CheckRecord["bucket"];
}

function reading(overrides: Partial<WorktreePoolReading>): WorktreePoolReading {
  return {
    errored: false,
    bareRepository: false,
    linkedWorktrees: false,
    mainCheckoutPath: null,
    defaultBranch: null,
    mainCheckoutBranch: null,
    mainCheckoutBranchRead: true,
    running: 0,
    free: 0,
    ...overrides,
  };
}

function classificationCases(): readonly WorktreePoolClassificationCase[] {
  const mainCheckoutPath = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
  const defaultBranch = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
  const [wrongDefaultBranch, wrongCheckedOutBranch] = sampleWorktreeTestValue(
    WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames(),
  );
  return [
    { overrides: { errored: true }, verdict: WORKTREE_POOL_VERDICT.UNKNOWN, bucket: VERDICT_BUCKET.UNKNOWN },
    {
      overrides: { bareRepository: false, linkedWorktrees: true },
      verdict: WORKTREE_POOL_VERDICT.NON_COMPLIANT,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      overrides: { bareRepository: true, mainCheckoutPath, defaultBranch, mainCheckoutBranch: defaultBranch },
      verdict: WORKTREE_POOL_VERDICT.COMPLIANT,
      bucket: VERDICT_BUCKET.HEALTHY,
    },
    {
      overrides: { bareRepository: true },
      verdict: WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_MISSING,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      overrides: { bareRepository: true, mainCheckoutPath, defaultBranch },
      verdict: WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_DETACHED,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      overrides: {
        bareRepository: true,
        mainCheckoutPath,
        defaultBranch: wrongDefaultBranch,
        mainCheckoutBranch: wrongCheckedOutBranch,
      },
      verdict: WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_WRONG_BRANCH,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      overrides: { bareRepository: true, mainCheckoutPath, mainCheckoutBranch: defaultBranch },
      verdict: WORKTREE_POOL_VERDICT.UNKNOWN,
      bucket: VERDICT_BUCKET.UNKNOWN,
    },
    {
      overrides: { bareRepository: true, mainCheckoutPath, defaultBranch, mainCheckoutBranchRead: false },
      verdict: WORKTREE_POOL_VERDICT.UNKNOWN,
      bucket: VERDICT_BUCKET.UNKNOWN,
    },
    { overrides: {}, verdict: WORKTREE_POOL_VERDICT.COMPLIANT, bucket: VERDICT_BUCKET.HEALTHY },
  ];
}

export function assertWorktreePoolLayoutMapping(): void {
  for (const testCase of classificationCases()) {
    const result = classifyWorktreePool(reading(testCase.overrides));
    expect(result.verdict).toBe(testCase.verdict);
    expect(result.bucket).toBe(testCase.bucket);
    expect(result.remediation.length).toBeGreaterThan(0);
  }
}

export function assertWorktreePoolOccupancyIsInformational(): void {
  const [running, free] = sampleWorktreeTestValue(
    fc.tuple(fc.nat({ max: 100 }), fc.nat({ max: 100 })),
  );
  const mainCheckoutPath = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
  const defaultBranch = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
  const result = classifyWorktreePool(reading({
    bareRepository: true,
    mainCheckoutPath,
    defaultBranch,
    mainCheckoutBranch: defaultBranch,
    running,
    free,
  }));

  expect(result.verdict).toBe(WORKTREE_POOL_VERDICT.COMPLIANT);
  expect(result.bucket).toBe(VERDICT_BUCKET.HEALTHY);
  expect(result.readings.running).toBe(String(running));
  expect(result.readings.free).toBe(String(free));
}

async function assertSnapshotCase(commonDirIsBare: boolean, writeClaims: boolean): Promise<void> {
  const [runningName, freeName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
  const [liveSessionId, deadSessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
  const [livePid, deadPid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
  const [liveStartedAt, deadStartedAt] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctStartTimes());
  const liveHost = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host());
  const [liveRandomBytes, deadRandomBytes] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctRandomBytes());

  await withTempDir(sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix()), async (productDir) => {
    const runningRoot = join(productDir, runningName);
    const freeRoot = join(productDir, freeName);
    const liveClaim = { sessionId: liveSessionId, host: liveHost, pid: livePid, startedAt: liveStartedAt };
    const deadClaim = { sessionId: deadSessionId, host: liveHost, pid: deadPid, startedAt: deadStartedAt };
    const facts: GitFacts = {
      worktreeRoot: runningRoot,
      worktreeRoots: [runningRoot, freeRoot],
      worktreeListRead: true,
      commonDir: commonDirIsBare
        ? join(productDir, `${runningName}${GIT_URL_SUFFIX}`)
        : join(productDir, GIT_DIR_BASENAME),
      commonDirIsBare,
      originUrl: commonDirIsBare ? sampleMainCheckoutTestValue(arbitraryOriginUrl(runningName)) : null,
    };
    const worktreesDir = worktreesScopeDir(productDir);

    if (writeClaims) {
      await writeClaim(worktreesDir, worktreeClaimName(runningRoot), liveClaim, {
        fs: defaultOccupancyFileSystem,
        randomBytes: liveRandomBytes,
      });
      await writeClaim(worktreesDir, worktreeClaimName(freeRoot), deadClaim, {
        fs: defaultOccupancyFileSystem,
        randomBytes: deadRandomBytes,
      });
    }

    const snapshot = await gatherWorktreePoolSnapshot({
      gatherGitFacts: async () => facts,
      resolveDefaultBranch: async () => runningName,
      readMainCheckoutBranch: async () => ({ read: true, branch: runningName }),
      fs: defaultOccupancyFileSystem,
      processTable: createProcessTable({
        host: liveClaim.host,
        processes: new Map([[liveClaim.pid, { alive: true, startTime: liveClaim.startedAt }]]),
      }),
    });
    const readingResult = worktreePoolReadingFromSnapshot(snapshot);
    const record = classifyWorktreePool(readingResult);

    expect(snapshot.errored).toBe(false);
    expect(snapshot.worktrees).toHaveLength(facts.worktreeRoots.length);
    expect(snapshot.currentWorktreeRoot).toBe(runningRoot);
    expect(snapshot.liveClaimSessionIds.has(liveClaim.sessionId)).toBe(writeClaims);
    expect(snapshot.liveClaimSessionIds.has(deadClaim.sessionId)).toBe(false);
    expect(readingResult).toEqual({
      errored: false,
      bareRepository: commonDirIsBare,
      linkedWorktrees: !commonDirIsBare,
      mainCheckoutPath: commonDirIsBare ? runningRoot : productDir,
      defaultBranch: commonDirIsBare ? runningName : null,
      mainCheckoutBranch: commonDirIsBare ? runningName : null,
      mainCheckoutBranchRead: true,
      running: writeClaims ? 1 : 0,
      free: writeClaims ? 1 : 2,
    });
    expect(record.verdict).toBe(
      commonDirIsBare ? WORKTREE_POOL_VERDICT.COMPLIANT : WORKTREE_POOL_VERDICT.NON_COMPLIANT,
    );
    expect(record.bucket).toBe(commonDirIsBare ? VERDICT_BUCKET.HEALTHY : VERDICT_BUCKET.BROKEN);
    expect(record.remediation.length).toBeGreaterThan(0);
  });
}

export async function assertWorktreePoolSnapshotMapping(): Promise<void> {
  await assertSnapshotCase(true, true);
  await assertSnapshotCase(false, false);
  await assertCanonicalStandingMapping();
}

async function assertCanonicalStandingCase(testCase: CanonicalStandingCase): Promise<void> {
  const [repositoryName, alternateName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
  const [defaultBranch, wrongBranch] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());

  await withTempDir(sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix()), async (productDir) => {
    const observedName = testCase.designated ? repositoryName : alternateName;
    const observedRoot = join(productDir, observedName);
    const facts: GitFacts = {
      worktreeRoot: observedRoot,
      worktreeRoots: [observedRoot],
      worktreeListRead: true,
      commonDir: join(productDir, `${repositoryName}${GIT_URL_SUFFIX}`),
      commonDirIsBare: true,
      originUrl: sampleMainCheckoutTestValue(arbitraryOriginUrl(repositoryName)),
    };
    const snapshot = await gatherWorktreePoolSnapshot({
      gatherGitFacts: async () => facts,
      resolveDefaultBranch: async () => testCase.defaultBranchAvailable ? defaultBranch : null,
      readMainCheckoutBranch: async () => ({
        read: testCase.branchRead,
        branch: testCase.detached
          ? null
          : testCase.wrongBranch
          ? wrongBranch
          : defaultBranch,
      }),
      fs: defaultOccupancyFileSystem,
      processTable: createProcessTable({
        host: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host()),
        processes: new Map(),
      }),
    });
    const record = classifyWorktreePool(worktreePoolReadingFromSnapshot(snapshot));

    expect(snapshot.mainCheckoutPath).toBe(testCase.designated ? observedRoot : null);
    expect(snapshot.defaultBranch).toBe(testCase.defaultBranchAvailable ? defaultBranch : null);
    expect(snapshot.mainCheckoutBranchRead).toBe(testCase.designated ? testCase.branchRead : true);
    expect(record.verdict).toBe(testCase.verdict);
    expect(record.bucket).toBe(testCase.bucket);
  });
}

async function assertCanonicalStandingMapping(): Promise<void> {
  const cases: readonly CanonicalStandingCase[] = [
    {
      designated: false,
      defaultBranchAvailable: true,
      branchRead: true,
      detached: false,
      wrongBranch: false,
      verdict: WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_MISSING,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      designated: true,
      defaultBranchAvailable: true,
      branchRead: true,
      detached: true,
      wrongBranch: false,
      verdict: WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_DETACHED,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      designated: true,
      defaultBranchAvailable: true,
      branchRead: true,
      detached: false,
      wrongBranch: true,
      verdict: WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_WRONG_BRANCH,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      designated: true,
      defaultBranchAvailable: false,
      branchRead: true,
      detached: false,
      wrongBranch: false,
      verdict: WORKTREE_POOL_VERDICT.UNKNOWN,
      bucket: VERDICT_BUCKET.UNKNOWN,
    },
    {
      designated: true,
      defaultBranchAvailable: true,
      branchRead: false,
      detached: false,
      wrongBranch: false,
      verdict: WORKTREE_POOL_VERDICT.UNKNOWN,
      bucket: VERDICT_BUCKET.UNKNOWN,
    },
  ];

  for (const testCase of cases) await assertCanonicalStandingCase(testCase);
}

function worktreePoolPropertyInput(): fc.Arbitrary<WorktreePoolPropertyInput> {
  return fc.record({
    worktreeNames: fc.uniqueArray(WORKTREE_TEST_GENERATOR.poolWorktreeName(), { minLength: 3, maxLength: 3 })
      .map((names) => [names[0], names[1], names[2]] as const),
    sessionIds: WORKTREE_TEST_GENERATOR.distinctSessionIds(),
    pids: WORKTREE_TEST_GENERATOR.distinctPids(),
    startTimes: WORKTREE_TEST_GENERATOR.distinctStartTimes(),
    host: WORKTREE_TEST_GENERATOR.host(),
    randomBytesPair: WORKTREE_TEST_GENERATOR.distinctRandomBytes(),
    tempPrefix: WORKTREE_TEST_GENERATOR.tempPrefix(),
  });
}

async function verifyFreeWorktreesPreserveLayout(input: WorktreePoolPropertyInput): Promise<void> {
  const [runningName, freeName, deadName] = input.worktreeNames;
  const [liveSessionId, deadSessionId] = input.sessionIds;
  const [livePid, deadPid] = input.pids;
  const [liveStartedAt, deadStartedAt] = input.startTimes;

  await withTempDir(input.tempPrefix, async (productDir) => {
    const runningRoot = join(productDir, runningName);
    const freeRoot = join(productDir, freeName);
    const deadRoot = join(productDir, deadName);
    const commonDir = join(productDir, `${runningName}${GIT_URL_SUFFIX}`);
    const worktreesDir = worktreesScopeDir(productDir);
    const liveClaim = { sessionId: liveSessionId, host: input.host, pid: livePid, startedAt: liveStartedAt };
    const deadClaim = { sessionId: deadSessionId, host: input.host, pid: deadPid, startedAt: deadStartedAt };
    const processTable = createProcessTable({
      host: input.host,
      processes: new Map([[livePid, { alive: true, startTime: liveStartedAt }]]),
    });

    await writeClaim(worktreesDir, worktreeClaimName(runningRoot), liveClaim, {
      fs: defaultOccupancyFileSystem,
      randomBytes: input.randomBytesPair[0],
    });

    async function gather(worktreeRoots: readonly string[]): Promise<CheckRecord> {
      const facts: GitFacts = {
        worktreeRoot: runningRoot,
        worktreeRoots,
        worktreeListRead: true,
        commonDir,
        commonDirIsBare: true,
        originUrl: sampleMainCheckoutTestValue(arbitraryOriginUrl(runningName)),
      };
      const snapshot = await gatherWorktreePoolSnapshot({
        gatherGitFacts: async () => facts,
        resolveDefaultBranch: async () => runningName,
        readMainCheckoutBranch: async () => ({ read: true, branch: runningName }),
        fs: defaultOccupancyFileSystem,
        processTable,
      });
      return classifyWorktreePool(worktreePoolReadingFromSnapshot(snapshot));
    }

    const baseRecord = await gather([runningRoot]);
    const freeRecord = await gather([runningRoot, freeRoot]);
    await writeClaim(worktreesDir, worktreeClaimName(deadRoot), deadClaim, {
      fs: defaultOccupancyFileSystem,
      randomBytes: input.randomBytesPair[1],
    });
    const deadRecord = await gather([runningRoot, deadRoot]);

    expect(baseRecord.verdict).toBe(WORKTREE_POOL_VERDICT.COMPLIANT);
    expect(baseRecord.bucket).toBe(VERDICT_BUCKET.HEALTHY);
    expect(baseRecord.readings).toMatchObject({ running: "1", free: "0" });
    expect(freeRecord.verdict).toBe(baseRecord.verdict);
    expect(freeRecord.bucket).toBe(baseRecord.bucket);
    expect(freeRecord.readings).toEqual({ ...baseRecord.readings, running: "1", free: "1" });
    expect(deadRecord.verdict).toBe(baseRecord.verdict);
    expect(deadRecord.bucket).toBe(baseRecord.bucket);
    expect(deadRecord.readings).toEqual({ ...baseRecord.readings, running: "1", free: "1" });
  });
}

export async function assertFreeWorktreesPreserveLayout(): Promise<void> {
  await assertProperty(
    worktreePoolPropertyInput(),
    verifyFreeWorktreesPreserveLayout,
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}
