import { describe, expect, it } from "vitest";

import { sessionEnvironmentReadingFromSnapshot, type WorktreePoolSnapshot } from "@/commands/diagnose/probes";
import { classifySessionEnvironment, SESSION_ENVIRONMENT_VERDICT } from "@/domains/diagnose/checks/session-environment";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";
import { OCCUPANCY_STATUS } from "@/domains/worktree/occupancy-store";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";

describe("the session-environment snapshot mapping derives the current worktree occupancy", () => {
  it.each([
    {
      name: "running current worktree with identity",
      status: OCCUPANCY_STATUS.RUNNING,
      hookPresent: false,
      sessionIdentity: true,
      expectedWorktreeClaimed: true,
      expectedVerdict: SESSION_ENVIRONMENT_VERDICT.WORKING,
      expectedBucket: VERDICT_BUCKET.HEALTHY,
    },
    {
      name: "free current worktree with identity",
      status: OCCUPANCY_STATUS.FREE,
      hookPresent: true,
      sessionIdentity: true,
      expectedWorktreeClaimed: false,
      expectedVerdict: SESSION_ENVIRONMENT_VERDICT.IDENTITY_ONLY,
      expectedBucket: VERDICT_BUCKET.DEGRADED,
    },
    {
      name: "running current worktree with claim identity",
      status: OCCUPANCY_STATUS.RUNNING,
      hookPresent: true,
      sessionIdentity: false,
      expectedWorktreeClaimed: true,
      expectedSessionIdentity: true,
      expectedVerdict: SESSION_ENVIRONMENT_VERDICT.WORKING,
      expectedBucket: VERDICT_BUCKET.HEALTHY,
    },
    {
      name: "running current worktree with claim identity and no hook",
      status: OCCUPANCY_STATUS.RUNNING,
      hookPresent: false,
      sessionIdentity: false,
      expectedWorktreeClaimed: true,
      expectedSessionIdentity: true,
      expectedVerdict: SESSION_ENVIRONMENT_VERDICT.WORKING,
      expectedBucket: VERDICT_BUCKET.HEALTHY,
    },
    {
      name: "running current worktree without claim identity",
      status: OCCUPANCY_STATUS.RUNNING,
      hookPresent: true,
      sessionIdentity: false,
      omitClaimSessionId: true,
      expectedWorktreeClaimed: true,
      expectedVerdict: SESSION_ENVIRONMENT_VERDICT.UNKNOWN,
      expectedBucket: VERDICT_BUCKET.UNKNOWN,
    },
    {
      name: "free current worktree without hook or identity",
      status: OCCUPANCY_STATUS.FREE,
      hookPresent: false,
      sessionIdentity: false,
      expectedWorktreeClaimed: false,
      expectedVerdict: SESSION_ENVIRONMENT_VERDICT.NOT_APPLICABLE,
      expectedBucket: VERDICT_BUCKET.NOT_APPLICABLE,
    },
  ])("maps session environment snapshot $name", (testCase) => {
    const worktreeRoot = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const defaultBranch = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const snapshot: WorktreePoolSnapshot = {
      errored: false,
      bareRepository: true,
      linkedWorktrees: false,
      mainCheckoutPath: worktreeRoot,
      defaultBranch,
      mainCheckoutBranch: defaultBranch,
      mainCheckoutBranchRead: true,
      worktrees: [
        {
          root: worktreeRoot,
          name: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName()),
          status: testCase.status,
          ...(testCase.omitClaimSessionId ? {} : {
            sessionId: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId()),
          }),
        },
      ],
      currentWorktreeRoot: worktreeRoot,
      liveClaimSessionIds: new Set(),
    };

    expect(
      sessionEnvironmentReadingFromSnapshot(snapshot, {
        hookPresent: testCase.hookPresent,
        sessionIdentity: testCase.sessionIdentity,
      }),
    ).toEqual({
      errored: false,
      hookPresent: testCase.hookPresent,
      sessionIdentity: testCase.expectedSessionIdentity ?? testCase.sessionIdentity,
      worktreeClaimed: testCase.expectedWorktreeClaimed,
    });
    const record = classifySessionEnvironment(
      sessionEnvironmentReadingFromSnapshot(snapshot, {
        hookPresent: testCase.hookPresent,
        sessionIdentity: testCase.sessionIdentity,
      }),
    );
    expect(record.verdict).toBe(testCase.expectedVerdict);
    expect(record.bucket).toBe(testCase.expectedBucket);
    expect(record.remediation.length).toBeGreaterThan(0);
  });
});
