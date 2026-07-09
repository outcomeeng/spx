import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  gatherWorktreePoolSnapshot,
  sessionStoreReadingFromSnapshot,
  type WorktreePoolSnapshot,
} from "@/commands/diagnose/probes";
import { classifySessionStore, SESSION_STORE_VERDICT } from "@/domains/diagnose/checks/session-store";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";
import { HOOK_SESSION_START_ENV } from "@/domains/hooks/session-start";
import { normalizeAgentSessionToken } from "@/domains/session/agent-session";
import type { SessionRecord } from "@/domains/session/list";
import { DEFAULT_SESSION_METADATA } from "@/domains/session/list";
import { SESSION_STATUSES } from "@/domains/session/types";
import { OCCUPANCY_STATUS, writeClaim } from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { GIT_URL_SUFFIX, type GitFacts } from "@/lib/git/root";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import {
  sampleDistinctPathUnsafeAgentSessionIdentities,
  sampleDistinctSessionIds,
} from "@testing/generators/session/session";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { createProcessTable } from "@testing/harnesses/worktree/harness";

function doingSession(id: string, agentSessionId: string): SessionRecord {
  return {
    id,
    status: SESSION_STATUSES[1],
    ...DEFAULT_SESSION_METADATA,
    specs: [],
    files: [],
    agent_session_id: agentSessionId,
  };
}

describe("the session-store snapshot mapping joins doing sessions to live worktree claims", () => {
  it.each([
    {
      name: "one orphaned session",
      includeOrphanedClaim: false,
      expectedOrphanedClaims: 1,
      expectedVerdict: SESSION_STORE_VERDICT.ORPHANED_CLAIMS,
      expectedBucket: VERDICT_BUCKET.DEGRADED,
    },
    {
      name: "all sessions backed",
      includeOrphanedClaim: true,
      expectedOrphanedClaims: 0,
      expectedVerdict: SESSION_STORE_VERDICT.CONSISTENT,
      expectedBucket: VERDICT_BUCKET.HEALTHY,
    },
  ])("maps session store snapshot $name", (testCase) => {
    const [backedSessionId, orphanedSessionId] = sampleDistinctSessionIds(2);
    const [backingAgentSessionId, orphanedAgentSessionId] = sampleDistinctPathUnsafeAgentSessionIdentities(2);
    const liveClaimSessionIds = new Set([normalizeAgentSessionToken(backingAgentSessionId)]);
    if (testCase.includeOrphanedClaim) liveClaimSessionIds.add(normalizeAgentSessionToken(orphanedAgentSessionId));

    const snapshot: WorktreePoolSnapshot = {
      errored: false,
      bareRepository: true,
      linkedWorktrees: false,
      worktrees: [
        {
          root: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
          name: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName()),
          status: OCCUPANCY_STATUS.RUNNING,
          sessionId: backingAgentSessionId,
        },
      ],
      currentWorktreeRoot: null,
      liveClaimSessionIds,
    };

    const reading = sessionStoreReadingFromSnapshot(snapshot, [
      doingSession(backedSessionId, backingAgentSessionId),
      doingSession(orphanedSessionId, orphanedAgentSessionId),
    ]);
    expect(reading).toEqual({ errored: false, orphanedClaims: testCase.expectedOrphanedClaims });
    const record = classifySessionStore(reading);
    expect(record.verdict).toBe(testCase.expectedVerdict);
    expect(record.bucket).toBe(testCase.expectedBucket);
    expect(record.remediation.length).toBeGreaterThan(0);
  });

  it("joins doing sessions to live claims merged from SPX_WORKTREE_CLAIM_PATH", async () => {
    await withTempDir(sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix()), async (productDir) => {
      const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
      const worktreeRoot = join(productDir, worktreeName);
      const worktreesDir = join(productDir, sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName()));
      const [doingSessionId] = sampleDistinctSessionIds(1);
      const claim = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
      const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
      const written = await writeClaim(worktreesDir, worktreeClaimName(worktreeRoot), claim, {
        fs: defaultOccupancyFileSystem,
        randomBytes,
      });
      if (!written.ok) throw new Error(written.error);

      const env = {
        [HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH]: written.value,
      };
      const facts: GitFacts = {
        worktreeRoot,
        worktreeRoots: [worktreeRoot],
        worktreeListRead: true,
        commonDir: join(productDir, `${worktreeName}${GIT_URL_SUFFIX}`),
        commonDirIsBare: true,
        originUrl: null,
      };
      const snapshot = await gatherWorktreePoolSnapshot({
        env,
        gatherGitFacts: async () => facts,
        fs: defaultOccupancyFileSystem,
        processTable: createProcessTable({
          host: claim.host,
          processes: new Map([[claim.pid, { alive: true, startTime: claim.startedAt }]]),
        }),
      });

      const reading = sessionStoreReadingFromSnapshot(
        snapshot,
        [doingSession(doingSessionId, claim.sessionId)],
      );

      expect(reading).toEqual({ errored: false, orphanedClaims: 0 });
      const record = classifySessionStore(reading);
      expect(record.verdict).toBe(SESSION_STORE_VERDICT.CONSISTENT);
      expect(record.bucket).toBe(VERDICT_BUCKET.HEALTHY);
    });
  });
});
