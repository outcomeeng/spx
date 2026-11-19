import { describe, expect, it } from "vitest";

import {
  sessionEnvironmentProbeFromSnapshotProvider,
  type WorktreePoolSnapshot,
  type WorktreePoolSnapshotProvider,
} from "@/commands/diagnose/probes";
import { probeClaimMergeCases } from "@testing/generators/diagnose/session-environment";
import { withLiveClaimSessionEnvironmentProbeFixture } from "@testing/harnesses/session-environment/harness";

function snapshotProvider(snapshot: WorktreePoolSnapshot): WorktreePoolSnapshotProvider {
  return {
    async read(): Promise<WorktreePoolSnapshot> {
      return snapshot;
    },
  };
}

describe("the session-environment probe maps exported claim paths", () => {
  it.each(probeClaimMergeCases())(
    "merges a live SPX_WORKTREE_CLAIM_PATH claim only when it names the current worktree (claim matches current worktree: $claimMatchesCurrentWorktree, shell identity: $shellIdentity)",
    async ({ claimMatchesCurrentWorktree, shellIdentity, expectedReading }) => {
      await withLiveClaimSessionEnvironmentProbeFixture({
        claimMatchesCurrentWorktree,
        shellIdentity,
      }, async ({ env, snapshot }) => {
        const reading = await sessionEnvironmentProbeFromSnapshotProvider(
          snapshotProvider(snapshot),
          env,
        ).probe();

        expect(reading).toEqual(expectedReading);
      });
    },
  );
});
