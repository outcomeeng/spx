import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve as resolvePath } from "node:path";

import { describe, expect, it } from "vitest";

import { claimCommand, statusCommand, WORKTREE_STATUS_RENDER } from "@/commands/worktree/index";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { resolveWorktreesDir, WORKTREE_RESOLVE_ERROR, type WorktreePathInfo } from "@/domains/worktree/resolve";
import {
  defaultGitDependencies,
  GIT_COMMON_DIR_ARGS,
  GIT_CORE_BARE_ARGS,
  GIT_CORE_BARE_TRUE,
  GIT_REMOTE_GET_URL_ORIGIN_ARGS,
  GIT_SHOW_TOPLEVEL_ARGS,
  GIT_WORKTREE_LIST_PORCELAIN_ARGS,
  GIT_WORKTREE_PORCELAIN_ROOT_PREFIX,
  type GitDependencies,
} from "@/lib/git/root";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { defaultWorktreePathInfo } from "@/lib/worktree-path-info";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { gitArgsEqual } from "@testing/harnesses/git-test-constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";
import { createProcessTable, type ProcessTableEntry, withWorktreePool } from "@testing/harnesses/worktree/harness";

function duplicateBasenameGitDeps(options: {
  readonly currentWorktreeRoot: string;
  readonly ambiguousTargetPath: string;
  readonly commonDir: string;
  readonly worktreeRoots: readonly string[];
}): GitDependencies {
  return {
    execa: async (_command, args, commandOptions) => {
      if (gitArgsEqual(args, GIT_SHOW_TOPLEVEL_ARGS)) {
        return commandOptions?.cwd === options.ambiguousTargetPath
          ? { exitCode: 1, stdout: "", stderr: "" }
          : { exitCode: 0, stdout: options.currentWorktreeRoot, stderr: "" };
      }
      if (gitArgsEqual(args, GIT_COMMON_DIR_ARGS)) {
        return { exitCode: 0, stdout: options.commonDir, stderr: "" };
      }
      if (gitArgsEqual(args, GIT_REMOTE_GET_URL_ORIGIN_ARGS)) {
        return { exitCode: 1, stdout: "", stderr: "" };
      }
      if (gitArgsEqual(args, GIT_WORKTREE_LIST_PORCELAIN_ARGS)) {
        return {
          exitCode: 0,
          stdout: options.worktreeRoots.map((root) => `${GIT_WORKTREE_PORCELAIN_ROOT_PREFIX}${root}`).join("\n\n"),
          stderr: "",
        };
      }
      if (gitArgsEqual(args, GIT_CORE_BARE_ARGS)) {
        return { exitCode: 0, stdout: GIT_CORE_BARE_TRUE, stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "" };
    },
  };
}

const absentPathInfo: WorktreePathInfo = {
  isExistingNonDirectory: async () => false,
};

describe("worktree status path-form resolution", () => {
  it("resolves an explicit relative worktrees-dir override from the command cwd", async () => {
    const [cwdName, worktreesName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const tempPrefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());

    await withTempDir(tempPrefix, async (container) => {
      const cwd = join(container, cwdName);
      await mkdir(cwd, { recursive: true });

      const resolved = await resolveWorktreesDir({
        cwd,
        gitDeps: defaultGitDependencies,
        worktreesDir: worktreesName,
      });

      expect(resolved).toBe(resolvePath(cwd, worktreesName));
    });
  });

  it("maps every path that denotes the claimed worktree to its occupancy", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const [subdir, fileName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const claim = await claimCommand({
        claimRandomBytes,
        sessionId,
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        selfPid: holder.pid,
        env: { [CONTROLLING_PID_ENV]: String(holder.pid) },
      });
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);

      // A real subdirectory inside the worktree — `git rev-parse --show-toplevel`
      // resolves it back to the worktree root.
      const subdirPath = join(env.worktreePath, subdir);
      await mkdir(subdirPath);

      const filePath = join(env.worktreePath, fileName);
      await writeFile(filePath, fileName);

      const forms = [env.worktreePath, ".", "./", subdirPath, filePath];
      for (const form of forms) {
        const status = await statusCommand({
          worktrees: [form],
          cwd: env.worktreePath,
          fs: env.fs,
          gitDeps: defaultGitDependencies,
          worktreesDir: env.worktreesDir,
          processTable: env.processTable,
          pathInfo: defaultWorktreePathInfo,
        });
        expect(status.ok, `form ${form}`).toBe(true);
        if (!status.ok) throw new Error(`form ${form}: ${status.error}`);
        expect(status.value, `form ${form}`).toContain(
          `${WORKTREE_STATUS_RENDER.RUNNING_FALLBACK_RUNTIME} ${WORKTREE_STATUS_RENDER.RUNNING_WORD} [${holder.pid}]`,
        );
      }
    });
  });

  it("maps a bare pool worktree basename to the matching git-observed worktree", async () => {
    const [claimedName, callerName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const tempPrefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const processTable = createProcessTable({
      host: holder.host,
      processes: new Map<number, ProcessTableEntry>([
        [holder.pid, { alive: true, startTime: holder.startedAt }],
      ]),
    });

    await withWorktreeLayoutEnv(
      { bare: true, worktrees: [{ name: claimedName }, { name: callerName }] },
      async (layout) => {
        await withTempDir(tempPrefix, async (worktreesDir) => {
          const claim = await claimCommand({
            claimRandomBytes,
            sessionId,
            cwd: layout.worktree(claimedName),
            fs: defaultOccupancyFileSystem,
            gitDeps: defaultGitDependencies,
            worktreesDir,
            processTable,
            selfPid: holder.pid,
            env: { [CONTROLLING_PID_ENV]: String(holder.pid) },
          });
          expect(claim.ok).toBe(true);
          if (!claim.ok) throw new Error(claim.error);

          const status = await statusCommand({
            worktrees: [claimedName],
            cwd: layout.worktree(callerName),
            fs: defaultOccupancyFileSystem,
            gitDeps: defaultGitDependencies,
            worktreesDir,
            processTable,
            pathInfo: defaultWorktreePathInfo,
          });

          expect(status.ok).toBe(true);
          if (!status.ok) throw new Error(status.error);
          expect(status.value).toContain(`${claimedName}:`);
          expect(status.value).toContain(
            `${WORKTREE_STATUS_RENDER.RUNNING_FALLBACK_RUNTIME} ${WORKTREE_STATUS_RENDER.RUNNING_WORD} [${holder.pid}]`,
          );
        });
      },
    );
  });

  it("refuses an ambiguous bare basename that matches multiple git-observed worktrees", async () => {
    const [firstParent, secondParent] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const duplicateBasename = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const commonDir = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());
    const tempPrefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());

    await withTempDir(tempPrefix, async (container) => {
      const firstRoot = join(container, firstParent, duplicateBasename);
      const secondRoot = join(container, secondParent, duplicateBasename);
      const ambiguousTargetPath = join(firstRoot, duplicateBasename);

      const status = await statusCommand({
        worktrees: [duplicateBasename],
        cwd: firstRoot,
        fs: defaultOccupancyFileSystem,
        gitDeps: duplicateBasenameGitDeps({
          currentWorktreeRoot: firstRoot,
          ambiguousTargetPath,
          commonDir: join(container, commonDir),
          worktreeRoots: [firstRoot, secondRoot],
        }),
        worktreesDir: container,
        processTable: createProcessTable({ host: firstParent, processes: new Map() }),
        pathInfo: absentPathInfo,
      });

      expect(status.ok).toBe(false);
      if (status.ok) throw new Error(`expected ambiguous basename refusal, got status "${status.value}"`);
      expect(status.error).toBe(`${WORKTREE_RESOLVE_ERROR.AMBIGUOUS_WORKTREE_BASENAME}: ${duplicateBasename}`);
    });
  });

  it("refuses an ambiguous bare basename even when another target resolves", async () => {
    const [firstParent, secondParent] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const duplicateBasename = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const commonDir = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());
    const tempPrefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());

    await withTempDir(tempPrefix, async (container) => {
      const firstRoot = join(container, firstParent, duplicateBasename);
      const secondRoot = join(container, secondParent, duplicateBasename);
      const ambiguousTargetPath = join(firstRoot, duplicateBasename);

      const status = await statusCommand({
        worktrees: [duplicateBasename, firstRoot],
        cwd: firstRoot,
        fs: defaultOccupancyFileSystem,
        gitDeps: duplicateBasenameGitDeps({
          currentWorktreeRoot: firstRoot,
          ambiguousTargetPath,
          commonDir: join(container, commonDir),
          worktreeRoots: [firstRoot, secondRoot],
        }),
        worktreesDir: container,
        processTable: createProcessTable({ host: secondParent, processes: new Map() }),
        pathInfo: absentPathInfo,
      });

      expect(status.ok).toBe(false);
      if (status.ok) throw new Error(`expected mixed-target ambiguity refusal, got status "${status.value}"`);
      expect(status.error).toBe(`${WORKTREE_RESOLVE_ERROR.AMBIGUOUS_WORKTREE_BASENAME}: ${duplicateBasename}`);
    });
  });
});
