import { realpath } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  composeScopeDir,
  resolveBranchScopeDir,
  resolveChangesScopeDir,
  resolveSessionsScopeDir,
  resolveWorktreeScopeDir,
  resolveWorktreesScopeDir,
  slugBranchIdentity,
  STATE_STORE_DOMAIN,
  STATE_STORE_SCOPE_PATH,
  worktreeScopeDir,
} from "@/lib/state-store";
import {
  arbitraryNonBareLinkedLayoutCase,
  sampleMainCheckoutTestValue,
} from "@testing/generators/main-checkout/main-checkout";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";

describe("scope addressing", () => {
  it("resolves branch scope to the shared Git common-dir product root from main and non-main worktrees", async () => {
    const layout = sampleMainCheckoutTestValue(arbitraryNonBareLinkedLayoutCase());
    const branchSlug = slugBranchIdentity(sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchIdentity()));
    await withWorktreeLayoutEnv(layout.spec, async (env) => {
      const mainCheckoutRoot = await realpath(env.worktree(layout.mainCheckoutName));
      const mainCheckout = await resolveBranchScopeDir(branchSlug, { cwd: env.worktree(layout.mainCheckoutName) });
      const nonMain = await resolveBranchScopeDir(branchSlug, { cwd: env.worktree(layout.otherNames[0]) });

      expect(mainCheckout).toEqual({
        ok: true,
        value: join(mainCheckoutRoot, STATE_STORE_SCOPE_PATH.SPX_DIR, STATE_STORE_SCOPE_PATH.BRANCH_SCOPE, branchSlug),
      });
      expect(nonMain).toEqual(mainCheckout);
    });
  });

  it("resolves worktree scope to each local worktree root", async () => {
    const layout = sampleMainCheckoutTestValue(arbitraryNonBareLinkedLayoutCase());
    await withWorktreeLayoutEnv(layout.spec, async (env) => {
      const mainCheckoutRoot = await realpath(env.worktree(layout.mainCheckoutName));
      const nonMainRoot = await realpath(env.worktree(layout.otherNames[0]));
      const mainCheckout = await resolveWorktreeScopeDir({ cwd: env.worktree(layout.mainCheckoutName) });
      const nonMain = await resolveWorktreeScopeDir({ cwd: env.worktree(layout.otherNames[0]) });

      expect(mainCheckout).toBe(
        join(mainCheckoutRoot, STATE_STORE_SCOPE_PATH.SPX_DIR, STATE_STORE_SCOPE_PATH.WORKTREE_SCOPE),
      );
      expect(nonMain).toBe(join(nonMainRoot, STATE_STORE_SCOPE_PATH.SPX_DIR, STATE_STORE_SCOPE_PATH.WORKTREE_SCOPE));
      expect(nonMain).not.toBe(mainCheckout);
    });
  });

  it("resolves sessions scope to the shared Git common-dir product root from main and non-main worktrees", async () => {
    const layout = sampleMainCheckoutTestValue(arbitraryNonBareLinkedLayoutCase());
    await withWorktreeLayoutEnv(layout.spec, async (env) => {
      const mainCheckoutRoot = await realpath(env.worktree(layout.mainCheckoutName));
      const mainCheckout = await resolveSessionsScopeDir({ cwd: env.worktree(layout.mainCheckoutName) });
      const nonMain = await resolveSessionsScopeDir({ cwd: env.worktree(layout.otherNames[0]) });

      expect(mainCheckout.sessionsDir).toBe(
        join(mainCheckoutRoot, STATE_STORE_SCOPE_PATH.SPX_DIR, STATE_STORE_SCOPE_PATH.SESSIONS_SCOPE),
      );
      expect(nonMain.sessionsDir).toBe(mainCheckout.sessionsDir);
    });
  });

  it("resolves changes scope to the shared Git common-dir product root from main and non-main worktrees", async () => {
    const layout = sampleMainCheckoutTestValue(arbitraryNonBareLinkedLayoutCase());
    await withWorktreeLayoutEnv(layout.spec, async (env) => {
      const mainCheckoutRoot = await realpath(env.worktree(layout.mainCheckoutName));
      const mainCheckout = await resolveChangesScopeDir({ cwd: env.worktree(layout.mainCheckoutName) });
      const nonMain = await resolveChangesScopeDir({ cwd: env.worktree(layout.otherNames[0]) });

      expect(mainCheckout.changesDir).toBe(
        join(mainCheckoutRoot, STATE_STORE_SCOPE_PATH.SPX_DIR, STATE_STORE_SCOPE_PATH.CHANGES_SCOPE),
      );
      expect(nonMain.changesDir).toBe(mainCheckout.changesDir);
    });
  });

  it("resolves worktrees scope to the shared Git common-dir product root from main and non-main worktrees", async () => {
    const layout = sampleMainCheckoutTestValue(arbitraryNonBareLinkedLayoutCase());
    await withWorktreeLayoutEnv(layout.spec, async (env) => {
      const mainCheckoutRoot = await realpath(env.worktree(layout.mainCheckoutName));
      const mainCheckout = await resolveWorktreesScopeDir({ cwd: env.worktree(layout.mainCheckoutName) });
      const nonMain = await resolveWorktreesScopeDir({ cwd: env.worktree(layout.otherNames[0]) });

      expect(mainCheckout.worktreesDir).toBe(
        join(mainCheckoutRoot, STATE_STORE_SCOPE_PATH.SPX_DIR, STATE_STORE_SCOPE_PATH.WORKTREES_SCOPE),
      );
      expect(nonMain.worktreesDir).toBe(mainCheckout.worktreesDir);
    });
  });

  it("composes a session token inside the broader scope before the domain directory", () => {
    const baseScope = worktreeScopeDir(sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot()));
    const sessionToken = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());

    expect(composeScopeDir(baseScope, sessionToken, STATE_STORE_DOMAIN.COMPACT)).toEqual({
      ok: true,
      value: join(baseScope, sessionToken, STATE_STORE_DOMAIN.COMPACT),
    });
  });
});
