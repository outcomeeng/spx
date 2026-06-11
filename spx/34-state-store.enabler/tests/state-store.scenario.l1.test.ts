import { join } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  composeScopeDir,
  createJsonlRunFile,
  resolveBranchScopeDir,
  resolveWorktreeScopeDir,
  slugBranchIdentity,
  STATE_STORE_DOMAIN,
  STATE_STORE_ERROR,
  STATE_STORE_PATH,
  type StateStoreFileSystem,
  validateScopeToken,
} from "@/lib/state-store";
import {
  STATE_STORE_TEST_GENERATOR,
  sampleStateStoreTestValue,
} from "@testing/generators/state-store/state-store";
import { expectedStateStoreRunFileName } from "@testing/harnesses/state-store";
import { createSessionGitDeps, SESSION_GIT_DEPS_PATHS, WORKTREE_KIND } from "@testing/harnesses/session/harness";

function createNoopStateStoreFileSystem(): StateStoreFileSystem {
  return {
    mkdir: () => Promise.resolve(),
    writeFile: () => Promise.resolve(),
    appendFile: () => Promise.resolve(),
    readFile: () => Promise.resolve(""),
    readdir: () => Promise.resolve([]),
  };
}

describe("state-store scope paths", () => {
  it("resolves branch scope to the shared Git common-dir product root from root and linked worktrees", async () => {
    const branchSlug = slugBranchIdentity(sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchIdentity()));
    const root = await resolveBranchScopeDir(branchSlug, {
      deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.ROOT }),
    });
    const linked = await resolveBranchScopeDir(branchSlug, {
      deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.LINKED }),
    });

    expect(root.ok).toBe(true);
    expect(linked.ok).toBe(true);
    if (!root.ok) throw new Error(root.error);
    if (!linked.ok) throw new Error(linked.error);
    expect(root.value).toBe(join(
      SESSION_GIT_DEPS_PATHS.ROOT_TOPLEVEL,
      STATE_STORE_PATH.SPX_DIR,
      STATE_STORE_PATH.BRANCH_SCOPE,
      branchSlug,
    ));
    expect(linked.value).toBe(root.value);
  });

  it("resolves worktree scope to each local worktree root", async () => {
    const root = await resolveWorktreeScopeDir({
      deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.ROOT }),
    });
    const linked = await resolveWorktreeScopeDir({
      deps: createSessionGitDeps({ worktreeKind: WORKTREE_KIND.LINKED }),
    });

    expect(root.ok).toBe(true);
    expect(linked.ok).toBe(true);
    if (!root.ok) throw new Error(root.error);
    if (!linked.ok) throw new Error(linked.error);
    expect(root.value).toBe(join(
      SESSION_GIT_DEPS_PATHS.ROOT_TOPLEVEL,
      STATE_STORE_PATH.SPX_DIR,
      STATE_STORE_PATH.WORKTREE_SCOPE,
    ));
    expect(linked.value).toBe(join(
      SESSION_GIT_DEPS_PATHS.LINKED_TOPLEVEL,
      STATE_STORE_PATH.SPX_DIR,
      STATE_STORE_PATH.WORKTREE_SCOPE,
    ));
  });

  it("composes a session token inside the broader scope before the domain directory", () => {
    const sessionToken = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const baseScope = join(
      SESSION_GIT_DEPS_PATHS.ROOT_TOPLEVEL,
      STATE_STORE_PATH.SPX_DIR,
      STATE_STORE_PATH.WORKTREE_SCOPE,
    );
    const scoped = composeScopeDir(baseScope, sessionToken, STATE_STORE_DOMAIN.COMPACT);

    expect(scoped.ok).toBe(true);
    if (!scoped.ok) throw new Error(scoped.error);
    expect(scoped.value).toBe(join(baseScope, sessionToken, STATE_STORE_DOMAIN.COMPACT));
  });

  it("rejects scope tokens containing forbidden path markers before they become path segments", () => {
    fc.assert(
      fc.property(STATE_STORE_TEST_GENERATOR.scopeTokenContainingUnsafeMarker(), (unsafeToken) => {
        expect(validateScopeToken(unsafeToken)).toEqual({
          ok: false,
          error: STATE_STORE_ERROR.INVALID_TOKEN,
        });
      }),
    );
  });

  it("builds a single-artifact run file under runs/run-{run-token}.jsonl", async () => {
    const date = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.runDate());
    const runBytes = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.runIdBytes());
    const scopeDir = join(
      SESSION_GIT_DEPS_PATHS.ROOT_TOPLEVEL,
      STATE_STORE_PATH.SPX_DIR,
      STATE_STORE_PATH.WORKTREE_SCOPE,
    );

    const created = await createJsonlRunFile(scopeDir, STATE_STORE_DOMAIN.TEST, {
      fs: createNoopStateStoreFileSystem(),
      now: () => date,
      randomBytes: () => runBytes,
    });

    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.error);
    expect(created.value.runFileName).toBe(expectedStateStoreRunFileName(created.value.runToken));
    expect(created.value.runFilePath).toBe(join(
      scopeDir,
      STATE_STORE_DOMAIN.TEST,
      STATE_STORE_PATH.RUNS_DIR,
      created.value.runFileName,
    ));
  });
});
