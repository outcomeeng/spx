import { dirname, join } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  claimFilePath,
  classifyOccupancy,
  OCCUPANCY_CLAIM,
  OCCUPANCY_STATUS,
} from "@/domains/worktree/occupancy-store";
import { resolveWorktreesScopeDir, STATE_STORE_PATH } from "@/lib/state-store";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { createSessionGitDeps, SESSION_GIT_DEPS_PATHS, WORKTREE_KIND } from "@testing/harnesses/session/harness";
import { createLiveHolderProbe } from "@testing/harnesses/worktree/harness";

describe("worktree occupancy compliance", () => {
  it("composes claim paths under the resolved .spx/worktrees shared scope, the same from any worktree", async () => {
    const sharedWorktreesDir = join(
      dirname(SESSION_GIT_DEPS_PATHS.SHARED_COMMON_DIR),
      STATE_STORE_PATH.SPX_DIR,
      STATE_STORE_PATH.WORKTREES_SCOPE,
    );
    const fromMain = await resolveWorktreesScopeDir({
      deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT }),
    });
    const fromNonMain = await resolveWorktreesScopeDir({
      deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.NON_MAIN }),
    });

    expect(fromMain.worktreesDir).toBe(sharedWorktreesDir);
    expect(fromNonMain.worktreesDir).toBe(sharedWorktreesDir);

    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const claimPath = claimFilePath(fromMain.worktreesDir, name);
    expect(claimPath.ok).toBe(true);
    if (!claimPath.ok) throw new Error(claimPath.error);
    expect(claimPath.value.startsWith(`${fromMain.worktreesDir}/`)).toBe(true);
    expect(claimPath.value.endsWith(`${name}${OCCUPANCY_CLAIM.FILE_EXTENSION}`)).toBe(true);
  });

  it("never ages out: any live same-host holder with a matching start time reads occupied", () => {
    fc.assert(
      fc.property(WORKTREE_TEST_GENERATOR.claimRecord(), (record) => {
        expect(classifyOccupancy(record, createLiveHolderProbe(record))).toBe(OCCUPANCY_STATUS.OCCUPIED);
      }),
    );
  });
});
