/**
 * Session-environment test harness — builds live worktree-claim snapshots for
 * diagnose probe tests.
 *
 * @module testing/harnesses/session-environment/harness
 */

import { join } from "node:path";

import { gatherWorktreePoolSnapshot, type WorktreePoolSnapshot } from "@/commands/diagnose/probes";
import { HOOK_SESSION_START_ENV } from "@/domains/hooks/session-start";
import { type WorktreeClaimRecord, writeClaim } from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { GIT_URL_SUFFIX, type GitFacts } from "@/lib/git/root";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { createProcessTable } from "@testing/harnesses/worktree/harness";

export interface SessionEnvironmentProbeFixtureOptions {
  readonly claimMatchesCurrentWorktree: boolean;
  readonly shellIdentity: boolean;
}

export interface SessionEnvironmentProbeFixture {
  readonly env: Readonly<Record<string, string>>;
  readonly claim: WorktreeClaimRecord;
  readonly snapshot: WorktreePoolSnapshot;
}

export async function withLiveClaimSessionEnvironmentProbeFixture(
  options: SessionEnvironmentProbeFixtureOptions,
  callback: (fixture: SessionEnvironmentProbeFixture) => Promise<void>,
): Promise<void> {
  await withTempDir(sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix()), async (productDir) => {
    const [currentName, otherName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const currentWorktreeRoot = join(productDir, currentName);
    const claimedWorktreeRoot = options.claimMatchesCurrentWorktree
      ? currentWorktreeRoot
      : join(productDir, otherName);
    const worktreesDir = join(productDir, sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName()));
    const claim = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const written = await writeClaim(worktreesDir, worktreeClaimName(claimedWorktreeRoot), claim, {
      fs: defaultOccupancyFileSystem,
      randomBytes,
    });
    if (!written.ok) throw new Error(written.error);

    const env = {
      ...(options.shellIdentity ? { [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: claim.sessionId } : {}),
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

    await callback({ env, claim, snapshot });
  });
}
