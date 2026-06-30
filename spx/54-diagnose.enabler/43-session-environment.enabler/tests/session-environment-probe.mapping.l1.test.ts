import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  gatherWorktreePoolSnapshot,
  sessionEnvironmentProbeFromSnapshotProvider,
  type WorktreePoolSnapshot,
  type WorktreePoolSnapshotProvider,
} from "@/commands/diagnose/probes";
import { HOOK_SESSION_START_ENV } from "@/domains/hooks/session-start";
import { writeClaim } from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { GIT_URL_SUFFIX, type GitFacts } from "@/git/root";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { createProcessTable } from "@testing/harnesses/worktree/harness";

function snapshotProvider(snapshot: WorktreePoolSnapshot): WorktreePoolSnapshotProvider {
  return {
    async read(): Promise<WorktreePoolSnapshot> {
      return snapshot;
    },
  };
}

describe("the session-environment probe maps exported claim paths", () => {
  it("treats a live SPX_WORKTREE_CLAIM_PATH claim as the current worktree claim", async () => {
    await withTempDir(sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix()), async (productDir) => {
      const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
      const worktreeRoot = join(productDir, worktreeName);
      const worktreesDir = join(productDir, sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName()));
      const claim = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
      const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
      const claimName = worktreeClaimName(worktreeRoot);
      const written = await writeClaim(worktreesDir, claimName, claim, {
        fs: defaultOccupancyFileSystem,
        randomBytes,
      });
      if (!written.ok) throw new Error(written.error);
      const env = {
        [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: claim.sessionId,
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

  it("ignores a live SPX_WORKTREE_CLAIM_PATH claim for a different worktree", async () => {
    await withTempDir(sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix()), async (productDir) => {
      const [currentName, claimedName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
      const currentWorktreeRoot = join(productDir, currentName);
      const claimedWorktreeRoot = join(productDir, claimedName);
      const worktreesDir = join(productDir, sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName()));
      const claim = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
      const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
      const written = await writeClaim(worktreesDir, worktreeClaimName(claimedWorktreeRoot), claim, {
        fs: defaultOccupancyFileSystem,
        randomBytes,
      });
      if (!written.ok) throw new Error(written.error);
      const env = {
        [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: claim.sessionId,
        [HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH]: written.value,
      };
      const facts: GitFacts = {
        worktreeRoot: currentWorktreeRoot,
        worktreeRoots: [currentWorktreeRoot],
        worktreeListRead: true,
        commonDir: join(productDir, `${currentName}${GIT_URL_SUFFIX}`),
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
