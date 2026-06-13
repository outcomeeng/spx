import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  composeScopeDir,
  resolveBranchScopeDir,
  resolveSessionsScopeDir,
  resolveWorktreeScopeDir,
  slugBranchIdentity,
  STATE_STORE_DOMAIN,
  STATE_STORE_PATH,
} from "@/lib/state-store";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { createSessionGitDeps, SESSION_GIT_DEPS_PATHS, WORKTREE_KIND } from "@testing/harnesses/session/harness";

describe("scope addressing", () => {
  it("resolves branch scope to the shared Git common-dir product root from main and non-main worktrees", async () => {
    const branchSlug = slugBranchIdentity(sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchIdentity()));
    const mainCheckout = await resolveBranchScopeDir(branchSlug, {
      deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT }),
    });
    const nonMain = await resolveBranchScopeDir(branchSlug, {
      deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.NON_MAIN }),
    });

    expect(mainCheckout.ok).toBe(true);
    expect(nonMain.ok).toBe(true);
    if (!mainCheckout.ok) throw new Error(mainCheckout.error);
    if (!nonMain.ok) throw new Error(nonMain.error);
    expect(mainCheckout.value).toBe(join(
      SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL,
      STATE_STORE_PATH.SPX_DIR,
      STATE_STORE_PATH.BRANCH_SCOPE,
      branchSlug,
    ));
    expect(nonMain.value).toBe(mainCheckout.value);
  });

  it("resolves worktree scope to each local worktree root", async () => {
    const mainCheckout = await resolveWorktreeScopeDir({
      deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT }),
    });
    const nonMain = await resolveWorktreeScopeDir({
      deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.NON_MAIN }),
    });

    expect(mainCheckout.ok).toBe(true);
    expect(nonMain.ok).toBe(true);
    if (!mainCheckout.ok) throw new Error(mainCheckout.error);
    if (!nonMain.ok) throw new Error(nonMain.error);
    expect(mainCheckout.value).toBe(join(
      SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL,
      STATE_STORE_PATH.SPX_DIR,
      STATE_STORE_PATH.WORKTREE_SCOPE,
    ));
    expect(nonMain.value).toBe(join(
      SESSION_GIT_DEPS_PATHS.NON_MAIN_TOPLEVEL,
      STATE_STORE_PATH.SPX_DIR,
      STATE_STORE_PATH.WORKTREE_SCOPE,
    ));
  });

  it("resolves sessions scope to the shared Git common-dir product root from main and non-main worktrees", async () => {
    const mainCheckout = await resolveSessionsScopeDir({
      deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT }),
    });
    const nonMain = await resolveSessionsScopeDir({
      deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.NON_MAIN }),
    });

    expect(mainCheckout.sessionsDir).toBe(join(
      SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL,
      STATE_STORE_PATH.SPX_DIR,
      STATE_STORE_PATH.SESSIONS_SCOPE,
    ));
    expect(nonMain.sessionsDir).toBe(mainCheckout.sessionsDir);
  });

  it("composes a session token inside the broader scope before the domain directory", () => {
    const sessionToken = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const baseScope = join(
      SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL,
      STATE_STORE_PATH.SPX_DIR,
      STATE_STORE_PATH.WORKTREE_SCOPE,
    );
    const scoped = composeScopeDir(baseScope, sessionToken, STATE_STORE_DOMAIN.COMPACT);

    expect(scoped.ok).toBe(true);
    if (!scoped.ok) throw new Error(scoped.error);
    expect(scoped.value).toBe(join(baseScope, sessionToken, STATE_STORE_DOMAIN.COMPACT));
  });
});
