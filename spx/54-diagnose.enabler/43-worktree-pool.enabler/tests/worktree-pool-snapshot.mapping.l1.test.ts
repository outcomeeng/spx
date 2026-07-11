import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { gatherWorktreePoolSnapshot, worktreePoolReadingFromSnapshot } from "@/commands/diagnose/probes";
import { classifyWorktreePool, WORKTREE_POOL_VERDICT } from "@/domains/diagnose/checks/worktree-pool";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";
import { writeClaim } from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { GIT_DIR_BASENAME, GIT_URL_SUFFIX, type GitFacts } from "@/lib/git/root";
import { worktreesScopeDir } from "@/lib/state-store";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { arbitraryOriginUrl, sampleMainCheckoutTestValue } from "@testing/generators/main-checkout/main-checkout";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { createProcessTable } from "@testing/harnesses/worktree/harness";

describe("the worktree-pool snapshot maps git facts and occupancy into the worktree-pool reading", () => {
  it.each([
    {
      name: "bare pool with live and dead claims",
      commonDirIsBare: true,
      writeClaims: true,
      expectedBareRepository: true,
      expectedLinkedWorktrees: false,
      expectedRunning: 1,
      expectedFree: 1,
      expectedVerdict: WORKTREE_POOL_VERDICT.COMPLIANT,
      expectedBucket: VERDICT_BUCKET.HEALTHY,
    },
    {
      name: "non-bare linked worktrees without claims",
      commonDirIsBare: false,
      writeClaims: false,
      expectedBareRepository: false,
      expectedLinkedWorktrees: true,
      expectedRunning: 0,
      expectedFree: 2,
      expectedVerdict: WORKTREE_POOL_VERDICT.NON_COMPLIANT,
      expectedBucket: VERDICT_BUCKET.BROKEN,
    },
  ])("maps worktree snapshot $name", async (testCase) => {
    const [runningName, freeName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const [liveSessionId, deadSessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
    const [livePid, deadPid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
    const [liveStartedAt, deadStartedAt] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctStartTimes());
    const liveHost = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host());
    const liveClaim = {
      sessionId: liveSessionId,
      host: liveHost,
      pid: livePid,
      startedAt: liveStartedAt,
    };
    const deadClaim = {
      sessionId: deadSessionId,
      host: liveHost,
      pid: deadPid,
      startedAt: deadStartedAt,
    };
    const [liveRandomBytes, deadRandomBytes] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctRandomBytes());

    await withTempDir(sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix()), async (productDir) => {
      const runningRoot = join(productDir, runningName);
      const freeRoot = join(productDir, freeName);
      const facts: GitFacts = {
        worktreeRoot: runningRoot,
        worktreeRoots: [runningRoot, freeRoot],
        worktreeListRead: true,
        commonDir: testCase.commonDirIsBare
          ? join(productDir, `${runningName}${GIT_URL_SUFFIX}`)
          : join(productDir, GIT_DIR_BASENAME),
        commonDirIsBare: testCase.commonDirIsBare,
        originUrl: testCase.commonDirIsBare ? sampleMainCheckoutTestValue(arbitraryOriginUrl(runningName)) : null,
      };
      const worktreesDir = worktreesScopeDir(productDir);

      if (testCase.writeClaims) {
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

      expect(snapshot.errored).toBe(false);
      expect(snapshot.worktrees).toHaveLength(facts.worktreeRoots.length);
      expect(snapshot.currentWorktreeRoot).toBe(runningRoot);
      expect(snapshot.liveClaimSessionIds.has(liveClaim.sessionId)).toBe(testCase.writeClaims);
      expect(snapshot.liveClaimSessionIds.has(deadClaim.sessionId)).toBe(false);

      const reading = worktreePoolReadingFromSnapshot(snapshot);
      expect(reading).toEqual({
        errored: false,
        bareRepository: testCase.expectedBareRepository,
        linkedWorktrees: testCase.expectedLinkedWorktrees,
        mainCheckoutPath: testCase.commonDirIsBare ? runningRoot : productDir,
        defaultBranch: testCase.commonDirIsBare ? runningName : null,
        mainCheckoutBranch: testCase.commonDirIsBare ? runningName : null,
        mainCheckoutBranchRead: true,
        running: testCase.expectedRunning,
        free: testCase.expectedFree,
      });
      const record = classifyWorktreePool(reading);
      expect(record.verdict).toBe(testCase.expectedVerdict);
      expect(record.bucket).toBe(testCase.expectedBucket);
      expect(record.remediation.length).toBeGreaterThan(0);
    });
  });
});
