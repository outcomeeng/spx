import { existsSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { handoffCommand } from "@/commands/session/handoff";
import { resolveSessionConfig } from "@/commands/session/resolve-config";
import { DEFAULT_CONFIG } from "@/config/defaults";
import { detectGitCommonDirProductRoot, GIT_DIR_BASENAME } from "@/lib/git/root";
import { STATE_STORE_SCOPE_PATH } from "@/lib/state-store";
import {
  arbitraryBarePoolLayoutCase,
  sampleMainCheckoutTestValue,
} from "@testing/generators/main-checkout/main-checkout";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryHandoffHeader } from "@testing/generators/session/session";
import { buildHandoffStdin } from "@testing/harnesses/session/harness";
import { extractSessionFile } from "@testing/harnesses/session/session-store";
import { createFailingGitDeps, createScriptedGitDeps, STATE_GIT_FAILURE_MODE } from "@testing/harnesses/state/git-deps";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";

describe("resolveSessionConfig", () => {
  it("GIVEN explicit sessionsDir WHEN resolving THEN uses provided path and skips git detection", async () => {
    const sessionsDir = join("/", "custom-session-root");
    // A git invocation through these dependencies rejects, which the resolver turns into a cwd fallback and a
    // warning; the explicit paths with no warning therefore show that no git command ran.
    const deps = createFailingGitDeps(STATE_GIT_FAILURE_MODE.GIT_ERROR);
    const result = await resolveSessionConfig({ sessionsDir, deps });

    expect(result.config.todoDir).toBe(join(sessionsDir, DEFAULT_CONFIG.sessions.statusDirs.todo));
    expect(result.config.doingDir).toBe(join(sessionsDir, DEFAULT_CONFIG.sessions.statusDirs.doing));
    expect(result.config.archiveDir).toBe(join(sessionsDir, DEFAULT_CONFIG.sessions.statusDirs.archive));
    expect(result.warning).toBeUndefined();
  });

  it("GIVEN no sessionsDir WHEN resolving THEN detects Git common-dir product root and builds absolute paths", async () => {
    const productRoot = join("/", "product-root");
    const deps = createScriptedGitDeps([
      { stdout: productRoot, exitCode: 0 },
      { stdout: GIT_DIR_BASENAME, exitCode: 0 },
    ]);

    const result = await resolveSessionConfig({ deps });

    const expectedBase = join(productRoot, STATE_STORE_SCOPE_PATH.SPX_DIR, STATE_STORE_SCOPE_PATH.SESSIONS_SCOPE);
    expect(result.config.todoDir).toBe(join(expectedBase, DEFAULT_CONFIG.sessions.statusDirs.todo));
    expect(result.config.doingDir).toBe(join(expectedBase, DEFAULT_CONFIG.sessions.statusDirs.doing));
    expect(result.config.archiveDir).toBe(join(expectedBase, DEFAULT_CONFIG.sessions.statusDirs.archive));
  });

  it("GIVEN not in git repo WHEN resolving THEN uses cwd and emits warning", async () => {
    const cwd = "/not/a/repo";
    const deps = createScriptedGitDeps([{ stdout: "", exitCode: 128 }]);

    const result = await resolveSessionConfig({ deps, cwd });

    expect(result.config.todoDir).toBe(
      join(
        cwd,
        STATE_STORE_SCOPE_PATH.SPX_DIR,
        STATE_STORE_SCOPE_PATH.SESSIONS_SCOPE,
        DEFAULT_CONFIG.sessions.statusDirs.todo,
      ),
    );
    expect(result.warning).toBeDefined();
  });

  it("GIVEN worktree WHEN resolving THEN uses Git common-dir product root not worktree root", async () => {
    const gitCommonDirProductRoot = join("/", "common-product-root");
    const worktreeRoot = join("/", "linked-worktree-root");
    const deps = createScriptedGitDeps([
      { stdout: worktreeRoot, exitCode: 0 },
      { stdout: join(gitCommonDirProductRoot, GIT_DIR_BASENAME), exitCode: 0 },
    ]);

    const result = await resolveSessionConfig({ deps });

    expect(result.config.todoDir).toBe(
      join(
        gitCommonDirProductRoot,
        STATE_STORE_SCOPE_PATH.SPX_DIR,
        STATE_STORE_SCOPE_PATH.SESSIONS_SCOPE,
        DEFAULT_CONFIG.sessions.statusDirs.todo,
      ),
    );
    expect(result.config.todoDir).not.toContain(worktreeRoot);
  });

  it("GIVEN a worktree of a bare-repository pool WHEN handoff writes a session THEN no .spx directory appears in the worktree and the session lands under the common-dir product root", async () => {
    // Every checkout of a pool is a linked worktree of its bare repository; the main checkout is the one the
    // handoff gate admits, so a write there exercises the rule without a branch-state precondition.
    const layoutCase = sampleMainCheckoutTestValue(arbitraryBarePoolLayoutCase());
    const header = sampleGeneratedValue(arbitraryHandoffHeader());

    await withWorktreeLayoutEnv(layoutCase.spec, async (layout) => {
      const worktree = layout.worktree(layoutCase.mainCheckoutName);
      const { output } = await handoffCommand({ content: buildHandoffStdin(header, header.goal), cwd: worktree });

      expect(existsSync(join(worktree, STATE_STORE_SCOPE_PATH.SPX_DIR))).toBe(false);
      const commonRoot = await detectGitCommonDirProductRoot(worktree);
      const sessionsRoot = join(
        realpathSync(commonRoot.productDir),
        STATE_STORE_SCOPE_PATH.SPX_DIR,
        STATE_STORE_SCOPE_PATH.SESSIONS_SCOPE,
      );
      expect(realpathSync(extractSessionFile(output)).startsWith(sessionsRoot + sep)).toBe(true);
    });
  });
});
