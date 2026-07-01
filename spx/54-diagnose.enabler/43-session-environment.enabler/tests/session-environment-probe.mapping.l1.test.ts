import { describe, expect, it } from "vitest";

import {
  sessionEnvironmentProbeFromSnapshotProvider,
  type WorktreePoolSnapshot,
  type WorktreePoolSnapshotProvider,
} from "@/commands/diagnose/probes";
import { classifySessionEnvironment, SESSION_ENVIRONMENT_VERDICT } from "@/domains/diagnose/checks/session-environment";
import { HOOK_SESSION_START_ENV } from "@/domains/hooks/session-start";
import { withLiveClaimSessionEnvironmentProbeFixture } from "@testing/harnesses/session-environment/harness";

function snapshotProvider(snapshot: WorktreePoolSnapshot): WorktreePoolSnapshotProvider {
  return {
    async read(): Promise<WorktreePoolSnapshot> {
      return snapshot;
    },
  };
}

describe("the session-environment probe maps exported claim paths", () => {
  it("treats a live SPX_WORKTREE_CLAIM_PATH claim as the current worktree claim", async () => {
    await withLiveClaimSessionEnvironmentProbeFixture({
      claimMatchesCurrentWorktree: true,
      shellIdentity: true,
    }, async ({ env, snapshot }) => {
      const reading = await sessionEnvironmentProbeFromSnapshotProvider(
        snapshotProvider(snapshot),
        env,
      ).probe();

      expect(reading).toEqual({
        errored: false,
        hookPresent: true,
        sessionIdentity: true,
        worktreeClaimed: true,
      });
    });
  });

  it("derives session identity from a live current-worktree claim when shell identity is absent", async () => {
    await withLiveClaimSessionEnvironmentProbeFixture({
      claimMatchesCurrentWorktree: true,
      shellIdentity: false,
    }, async ({ env, snapshot }) => {
      expect(env).not.toHaveProperty(HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID);
      const reading = await sessionEnvironmentProbeFromSnapshotProvider(
        snapshotProvider(snapshot),
        env,
      ).probe();

      expect(reading).toEqual({
        errored: false,
        hookPresent: true,
        sessionIdentity: true,
        worktreeClaimed: true,
      });
      expect(classifySessionEnvironment(reading).verdict).toBe(SESSION_ENVIRONMENT_VERDICT.WORKING);
    });
  });

  it("ignores a live SPX_WORKTREE_CLAIM_PATH claim for a different worktree", async () => {
    await withLiveClaimSessionEnvironmentProbeFixture({
      claimMatchesCurrentWorktree: false,
      shellIdentity: true,
    }, async ({ env, snapshot }) => {
      const reading = await sessionEnvironmentProbeFromSnapshotProvider(
        snapshotProvider(snapshot),
        env,
      ).probe();

      expect(reading).toEqual({
        errored: false,
        hookPresent: true,
        sessionIdentity: true,
        worktreeClaimed: false,
      });
    });
  });
});
