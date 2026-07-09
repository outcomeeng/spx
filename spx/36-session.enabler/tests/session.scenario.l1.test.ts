import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveSessionConfig } from "@/commands/session/resolve-config";
import { DEFAULT_CONFIG } from "@/config/defaults";
import { GIT_DIR_BASENAME } from "@/lib/git/root";
import { STATE_STORE_SCOPE_PATH } from "@/lib/state-store";
import { createScriptedGitDeps } from "@testing/harnesses/state/git-deps";

describe("resolveSessionConfig", () => {
  it("GIVEN explicit sessionsDir WHEN resolving THEN uses provided path", async () => {
    const sessionsDir = join("/", "custom-session-root");
    const result = await resolveSessionConfig({ sessionsDir });

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
});
