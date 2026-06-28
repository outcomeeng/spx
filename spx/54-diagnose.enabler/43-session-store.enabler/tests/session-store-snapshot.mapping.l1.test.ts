import { describe, expect, it } from "vitest";

import { sessionStoreReadingFromSnapshot, type WorktreePoolSnapshot } from "@/commands/diagnose/probes";
import { classifySessionStore, SESSION_STORE_VERDICT } from "@/domains/diagnose/checks/session-store";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";
import { normalizeAgentSessionToken } from "@/domains/session/agent-session";
import type { SessionRecord } from "@/domains/session/list";
import { DEFAULT_SESSION_METADATA } from "@/domains/session/list";
import { SESSION_STATUSES } from "@/domains/session/types";
import { OCCUPANCY_STATUS } from "@/domains/worktree/occupancy-store";
import {
  sampleDistinctPathUnsafeAgentSessionIdentities,
  sampleDistinctSessionIds,
} from "@testing/generators/session/session";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";

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
});
