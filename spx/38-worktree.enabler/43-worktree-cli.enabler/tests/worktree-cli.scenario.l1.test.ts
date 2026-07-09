import { mkdir, realpath, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve as resolvePath, sep } from "node:path";

import { describe, expect, it } from "vitest";

import {
  claimCommand,
  releaseCommand,
  statusCommand,
  WORKTREE_RELEASE_ERROR,
  WORKTREE_STATUS_ERROR,
  WORKTREE_STATUS_FORMAT,
  WORKTREE_STATUS_RENDER,
} from "@/commands/worktree/index";
import { AGENT_SESSION_ENV, normalizeAgentSessionToken, resolveAgentSessionId } from "@/domains/session/agent-session";
import { AGENT_RUNTIME, AGENT_RUNTIME_DISPLAY_NAME, CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { OCCUPANCY_ERROR, OCCUPANCY_STATUS, readClaim, writeClaim } from "@/domains/worktree/occupancy-store";
import { WORKTREE_RESOLVE_ERROR } from "@/domains/worktree/resolve";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
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
import { DETAIL_BRANCH_SEPARATOR, DETAIL_ELBOW, DETAIL_TEE } from "@/lib/styled-output/styled-output";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { defaultWorktreePathInfo } from "@/lib/worktree-path-info";
import { samplePathUnsafeAgentSessionIdentity, SESSION_GENERATOR_ERROR } from "@testing/generators/session/session";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { gitArgsEqual } from "@testing/harnesses/git-test-constants";
import { createSessionGitDeps, SESSION_GIT_DEPS_PATHS, WORKTREE_KIND } from "@testing/harnesses/session/harness";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";
import { createProcessTable, type ProcessTableEntry, withWorktreePool } from "@testing/harnesses/worktree/harness";

function worktreeListDeps(options: {
  readonly worktreeRoot: string;
  readonly commonDir: string;
  readonly worktreeRoots: readonly string[];
}): GitDependencies {
  return {
    execa: async (_command, args) => {
      if (gitArgsEqual(args, GIT_SHOW_TOPLEVEL_ARGS)) {
        return { exitCode: 0, stdout: options.worktreeRoot, stderr: "" };
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

function pathAwareWorktreeListDeps(options: {
  readonly commonDir: string;
  readonly worktreeRoots: readonly string[];
}): GitDependencies {
  return {
    execa: async (_command, args, commandOptions) => {
      if (gitArgsEqual(args, GIT_SHOW_TOPLEVEL_ARGS)) {
        const cwd = String(commandOptions?.cwd ?? options.worktreeRoots[0]);
        const worktreeRoot = options.worktreeRoots.find((root) => isPathInsideOrEqual(root, cwd));
        return worktreeRoot === undefined
          ? { exitCode: 1, stdout: "", stderr: "" }
          : { exitCode: 0, stdout: worktreeRoot, stderr: "" };
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

function isPathInsideOrEqual(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function worktreeListUnavailableDeps(options: {
  readonly worktreeRoot: string;
  readonly commonDir: string;
  readonly unresolvedGitPath?: string;
}): GitDependencies {
  return {
    execa: async (_command, args, commandOptions) => {
      if (gitArgsEqual(args, GIT_SHOW_TOPLEVEL_ARGS)) {
        if (commandOptions?.cwd === options.unresolvedGitPath) {
          return { exitCode: 1, stdout: "", stderr: "" };
        }
        return { exitCode: 0, stdout: options.worktreeRoot, stderr: "" };
      }
      if (gitArgsEqual(args, GIT_COMMON_DIR_ARGS)) {
        return { exitCode: 0, stdout: options.commonDir, stderr: "" };
      }
      if (gitArgsEqual(args, GIT_REMOTE_GET_URL_ORIGIN_ARGS)) {
        return { exitCode: 1, stdout: "", stderr: "" };
      }
      if (gitArgsEqual(args, GIT_WORKTREE_LIST_PORCELAIN_ARGS)) {
        return { exitCode: 1, stdout: "", stderr: "" };
      }
      if (gitArgsEqual(args, GIT_CORE_BARE_ARGS)) {
        return { exitCode: 0, stdout: GIT_CORE_BARE_TRUE, stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "" };
    },
  };
}

const notGitDeps: GitDependencies = {
  execa: async () => ({ exitCode: 1, stdout: "", stderr: "" }),
};

describe("worktree command handlers", () => {
  it("writes a claim for the running worktree under the resolved scope", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const host = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host());
    const startedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const [selfPid, agentPid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
    const gitDeps = createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT });
    const expectedName = worktreeClaimName(SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL);
    const table = createProcessTable({
      host,
      processes: new Map<number, ProcessTableEntry>([[agentPid, { startTime: startedAt, alive: true }]]),
    });

    await withTempDir(prefix, async (worktreesDir) => {
      const result = await claimCommand({
        claimRandomBytes,
        cwd: SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL,
        fs: defaultOccupancyFileSystem,
        sessionId,
        worktreesDir,
        gitDeps,
        processTable: table,
        selfPid,
        env: { [CONTROLLING_PID_ENV]: String(agentPid) },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);

      const claim = await readClaim(worktreesDir, expectedName, { fs: defaultOccupancyFileSystem });
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);
      expect(claim.value).toEqual({ sessionId, host, pid: agentPid, startedAt });
    });
  });

  it("writes a normalized claim for a path-unsafe explicit session id", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const host = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host());
    const startedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const rawSessionId = samplePathUnsafeAgentSessionIdentity();
    const normalizedSessionId = normalizeAgentSessionToken(rawSessionId);
    const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const [selfPid, agentPid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
    const gitDeps = createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT });
    const expectedName = worktreeClaimName(SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL);
    const table = createProcessTable({
      host,
      processes: new Map<number, ProcessTableEntry>([[agentPid, { startTime: startedAt, alive: true }]]),
    });

    await withTempDir(prefix, async (worktreesDir) => {
      const result = await claimCommand({
        claimRandomBytes,
        cwd: SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL,
        fs: defaultOccupancyFileSystem,
        sessionId: rawSessionId,
        worktreesDir,
        gitDeps,
        processTable: table,
        selfPid,
        env: { [CONTROLLING_PID_ENV]: String(agentPid) },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);

      const claim = await readClaim(worktreesDir, expectedName, { fs: defaultOccupancyFileSystem });
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);
      expect(claim.value).toEqual({ sessionId: normalizedSessionId, host, pid: agentPid, startedAt });
    });
  });

  it("reports running with the holder's pid for a live holder, and free for no claim or a dead holder", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const name = worktreeClaimName(basename(env.worktreePath));
      const deadTable = createProcessTable({ host: holder.host, processes: new Map<number, ProcessTableEntry>() });

      const noClaim = await statusCommand({
        worktrees: [env.worktreePath],
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        format: WORKTREE_STATUS_FORMAT.JSON,
        pathInfo: defaultWorktreePathInfo,
      });
      expect(noClaim.ok).toBe(true);
      if (!noClaim.ok) throw new Error(noClaim.error);
      expect(JSON.parse(noClaim.value)).toEqual({ worktree: name, status: OCCUPANCY_STATUS.FREE });

      await writeClaim(
        env.worktreesDir,
        name,
        {
          sessionId,
          host: holder.host,
          pid: holder.pid,
          startedAt: holder.startedAt,
        },
        { fs: env.fs, randomBytes: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes()) },
      );

      const running = await statusCommand({
        worktrees: [env.worktreePath],
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        pathInfo: defaultWorktreePathInfo,
      });
      expect(running.ok).toBe(true);
      if (!running.ok) throw new Error(running.error);
      expect(running.value).toContain(
        `${WORKTREE_STATUS_RENDER.RUNNING_FALLBACK_RUNTIME} ${WORKTREE_STATUS_RENDER.RUNNING_WORD} [${holder.pid}]`,
      );

      const runningJson = await statusCommand({
        worktrees: [env.worktreePath],
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        format: WORKTREE_STATUS_FORMAT.JSON,
        pathInfo: defaultWorktreePathInfo,
      });
      expect(runningJson.ok).toBe(true);
      if (!runningJson.ok) throw new Error(runningJson.error);
      expect(JSON.parse(runningJson.value)).toEqual({
        worktree: name,
        status: OCCUPANCY_STATUS.RUNNING,
        pid: holder.pid,
        session: sessionId,
        host: holder.host,
      });

      const runningNoArg = await statusCommand({
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        pathInfo: defaultWorktreePathInfo,
      });
      expect(runningNoArg.ok).toBe(true);
      if (!runningNoArg.ok) throw new Error(runningNoArg.error);
      expect(runningNoArg.value).toContain(
        `${WORKTREE_STATUS_RENDER.RUNNING_FALLBACK_RUNTIME} ${WORKTREE_STATUS_RENDER.RUNNING_WORD} [${holder.pid}]`,
      );

      const free = await statusCommand({
        worktrees: [env.worktreePath],
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: deadTable,
        pathInfo: defaultWorktreePathInfo,
      });
      expect(free.ok).toBe(true);
      if (!free.ok) throw new Error(free.error);
      const expectedParent = `${await realpath(env.container)}${sep}`;
      const freeLines = free.value.split("\n");
      expect(freeLines).toEqual([
        expectedParent,
        `  ${DETAIL_ELBOW}${DETAIL_BRANCH_SEPARATOR}${worktreeName}: ${WORKTREE_STATUS_RENDER.FREE}`,
      ]);
    });
  });

  it("rejects a claim for a worktree whose holder is live and leaves that holder unchanged", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const host = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host());
    const [firstStartedAt, secondStartedAt] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctStartTimes());
    const [firstSessionId, secondSessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
    const [firstRandomBytes, secondRandomBytes] = sampleWorktreeTestValue(
      WORKTREE_TEST_GENERATOR.distinctRandomBytes(),
    );
    const [selfPid, firstAgentPid, secondAgentPid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
    const gitDeps = createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT });
    const expectedName = worktreeClaimName(SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL);
    const existingRecord = {
      sessionId: firstSessionId,
      host,
      pid: firstAgentPid,
      startedAt: firstStartedAt,
    };
    const table = createProcessTable({
      host,
      processes: new Map<number, ProcessTableEntry>([
        [firstAgentPid, { startTime: firstStartedAt, alive: true }],
        [secondAgentPid, { startTime: secondStartedAt, alive: true }],
      ]),
    });

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, expectedName, existingRecord, {
        fs: defaultOccupancyFileSystem,
        randomBytes: firstRandomBytes,
      });

      const result = await claimCommand({
        claimRandomBytes: secondRandomBytes,
        cwd: SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL,
        fs: defaultOccupancyFileSystem,
        sessionId: secondSessionId,
        worktreesDir,
        gitDeps,
        processTable: table,
        selfPid,
        env: { [CONTROLLING_PID_ENV]: String(secondAgentPid) },
      });

      expect(result).toEqual({ ok: false, error: OCCUPANCY_ERROR.CLAIM_HELD });
      const claim = await readClaim(worktreesDir, expectedName, { fs: defaultOccupancyFileSystem });
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);
      expect(claim.value).toEqual(existingRecord);
    });
  });

  it("renders text status as a grouped tree with runtime-qualified running holders", async () => {
    const [firstName, secondName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const runtimeCommand = `/${AGENT_RUNTIME.CODEX}`;

    await withWorktreeLayoutEnv(
      { bare: true, worktrees: [{ name: firstName }, { name: secondName }] },
      async (layout) => {
        await withTempDir(sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix()), async (worktreesDir) => {
          const firstPath = layout.worktree(firstName);
          const secondPath = layout.worktree(secondName);
          await writeClaim(
            worktreesDir,
            worktreeClaimName(firstPath),
            {
              sessionId,
              host: holder.host,
              pid: holder.pid,
              startedAt: holder.startedAt,
            },
            {
              fs: defaultOccupancyFileSystem,
              randomBytes: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes()),
            },
          );

          const status = await statusCommand({
            worktrees: [firstPath, secondPath],
            cwd: firstPath,
            fs: defaultOccupancyFileSystem,
            gitDeps: defaultGitDependencies,
            worktreesDir,
            processTable: createProcessTable({
              host: holder.host,
              processes: new Map<number, ProcessTableEntry>([
                [holder.pid, { alive: true, command: runtimeCommand, startTime: holder.startedAt }],
              ]),
            }),
            pathInfo: defaultWorktreePathInfo,
          });

          expect(status.ok).toBe(true);
          if (!status.ok) throw new Error(status.error);
          const expectedParent = `${await realpath(layout.container)}${sep}`;
          const lines = status.value.split("\n");
          expect(lines).toEqual([
            expectedParent,
            `  ${DETAIL_TEE}${DETAIL_BRANCH_SEPARATOR}${firstName}: ${AGENT_RUNTIME_DISPLAY_NAME.codex} ${WORKTREE_STATUS_RENDER.RUNNING_WORD} [${holder.pid}]`,
            `  ${DETAIL_ELBOW}${DETAIL_BRANCH_SEPARATOR}${secondName}: ${WORKTREE_STATUS_RENDER.FREE}`,
          ]);
        });
      },
    );
  });

  it("renders mixed-parent worktrees under slash-suffixed parent headings", async () => {
    const [firstParentName, secondParentName] = sampleWorktreeTestValue(
      WORKTREE_TEST_GENERATOR.distinctWriteTokens(),
    );
    const [firstWorktreeName, secondWorktreeName] = sampleWorktreeTestValue(
      WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames(),
    );
    const commonDirName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());
    const tempPrefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());

    await withTempDir(tempPrefix, async (container) => {
      const firstParent = join(container, firstParentName);
      const secondParent = join(container, secondParentName);
      const firstRoot = join(firstParent, firstWorktreeName);
      const secondRoot = join(secondParent, secondWorktreeName);
      await mkdir(firstRoot, { recursive: true });
      await mkdir(secondRoot, { recursive: true });

      const status = await statusCommand({
        worktrees: [firstRoot, secondRoot],
        cwd: firstRoot,
        fs: defaultOccupancyFileSystem,
        gitDeps: pathAwareWorktreeListDeps({
          commonDir: join(container, commonDirName),
          worktreeRoots: [firstRoot, secondRoot],
        }),
        worktreesDir: container,
        processTable: createProcessTable({ host: firstParentName, processes: new Map() }),
        pathInfo: defaultWorktreePathInfo,
      });

      expect(status.ok).toBe(true);
      if (!status.ok) throw new Error(status.error);
      const lines = status.value.split("\n");
      expect(lines).toEqual([
        `${firstParent}${sep}`,
        `  ${DETAIL_ELBOW}${DETAIL_BRANCH_SEPARATOR}${firstWorktreeName}: ${WORKTREE_STATUS_RENDER.FREE}`,
        `${secondParent}${sep}`,
        `  ${DETAIL_ELBOW}${DETAIL_BRANCH_SEPARATOR}${secondWorktreeName}: ${WORKTREE_STATUS_RENDER.FREE}`,
      ]);
    });
  });

  it("reports duplicate resolved status targets once in first-seen order", async () => {
    const [worktreeName, subdir] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const fileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const subdirPath = join(env.worktreePath, subdir);
      const filePath = join(subdirPath, fileName);
      await mkdir(subdirPath);
      await writeFile(filePath, fileName);

      const status = await statusCommand({
        worktrees: [env.worktreePath, filePath, subdirPath],
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        format: WORKTREE_STATUS_FORMAT.JSON,
        pathInfo: defaultWorktreePathInfo,
      });

      expect(status.ok).toBe(true);
      if (!status.ok) throw new Error(status.error);
      expect(JSON.parse(status.value)).toEqual([
        { worktree: worktreeClaimName(env.worktreePath), status: OCCUPANCY_STATUS.FREE },
      ]);
    });
  });

  it("reports every git-observed worktree when all targets are requested", async () => {
    const [firstName, secondName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());

    await withWorktreeLayoutEnv(
      { bare: true, worktrees: [{ name: firstName }, { name: secondName }] },
      async (layout) => {
        await withTempDir(sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix()), async (worktreesDir) => {
          const firstPath = layout.worktree(firstName);
          const secondPath = layout.worktree(secondName);
          const firstClaimName = worktreeClaimName(firstPath);
          const secondClaimName = worktreeClaimName(secondPath);

          await writeClaim(
            worktreesDir,
            firstClaimName,
            {
              sessionId,
              host: holder.host,
              pid: holder.pid,
              startedAt: holder.startedAt,
            },
            {
              fs: defaultOccupancyFileSystem,
              randomBytes: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes()),
            },
          );

          const status = await statusCommand({
            all: true,
            cwd: firstPath,
            fs: defaultOccupancyFileSystem,
            gitDeps: worktreeListDeps({
              worktreeRoot: firstPath,
              commonDir: layout.container,
              worktreeRoots: [secondPath, firstPath],
            }),
            worktreesDir,
            processTable: createProcessTable({
              host: holder.host,
              processes: new Map<number, ProcessTableEntry>([
                [holder.pid, { alive: true, startTime: holder.startedAt }],
              ]),
            }),
            format: WORKTREE_STATUS_FORMAT.JSON,
            pathInfo: defaultWorktreePathInfo,
          });

          expect(status.ok).toBe(true);
          if (!status.ok) throw new Error(status.error);
          expect(JSON.parse(status.value)).toEqual([
            { worktree: secondClaimName, status: OCCUPANCY_STATUS.FREE },
            {
              worktree: firstClaimName,
              status: OCCUPANCY_STATUS.RUNNING,
              pid: holder.pid,
              session: sessionId,
              host: holder.host,
            },
          ]);
        });
      },
    );
  });

  it("reports the established non-worktree diagnostic when all targets are requested outside git", async () => {
    const cwd = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());

    const status = await statusCommand({
      all: true,
      cwd,
      fs: defaultOccupancyFileSystem,
      gitDeps: notGitDeps,
      processTable: createProcessTable({ host: cwd, processes: new Map() }),
      pathInfo: defaultWorktreePathInfo,
    });

    expect(status).toEqual({ ok: false, error: `${WORKTREE_RESOLVE_ERROR.NOT_A_WORKTREE}: ${cwd}` });
  });

  it("reports worktree-list unavailability when all targets are requested inside git and list fails", async () => {
    const [worktreeName, commonDirName] = sampleWorktreeTestValue(
      WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames(),
    );
    const worktreeRoot = join("/", worktreeName);
    const commonDir = join("/", commonDirName);

    const status = await statusCommand({
      all: true,
      cwd: worktreeRoot,
      fs: defaultOccupancyFileSystem,
      gitDeps: worktreeListUnavailableDeps({ worktreeRoot, commonDir }),
      processTable: createProcessTable({ host: worktreeName, processes: new Map() }),
      pathInfo: defaultWorktreePathInfo,
    });

    expect(status).toEqual({ ok: false, error: WORKTREE_RESOLVE_ERROR.WORKTREE_LIST_UNAVAILABLE });
  });

  it("reports worktree-list unavailability when bare-basename fallback cannot list worktrees", async () => {
    const [worktreeName, commonDirName] = sampleWorktreeTestValue(
      WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames(),
    );
    const worktreeRoot = join("/", worktreeName);
    const commonDir = join("/", commonDirName);

    const status = await statusCommand({
      worktrees: [worktreeName],
      cwd: worktreeRoot,
      fs: defaultOccupancyFileSystem,
      gitDeps: worktreeListUnavailableDeps({
        worktreeRoot,
        commonDir,
        unresolvedGitPath: join(worktreeRoot, worktreeName),
      }),
      processTable: createProcessTable({ host: commonDirName, processes: new Map() }),
      pathInfo: defaultWorktreePathInfo,
    });

    expect(status).toEqual({ ok: false, error: WORKTREE_RESOLVE_ERROR.WORKTREE_LIST_UNAVAILABLE });
  });

  it("reports resolved targets when another target cannot read the worktree list", async () => {
    const [worktreeName, commonDirName] = sampleWorktreeTestValue(
      WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames(),
    );
    const worktreeRoot = join("/", worktreeName);
    const commonDir = join("/", commonDirName);

    const status = await statusCommand({
      worktrees: [worktreeRoot, worktreeName],
      cwd: worktreeRoot,
      format: WORKTREE_STATUS_FORMAT.JSON,
      fs: defaultOccupancyFileSystem,
      gitDeps: worktreeListUnavailableDeps({
        worktreeRoot,
        commonDir,
        unresolvedGitPath: join(worktreeRoot, worktreeName),
      }),
      processTable: createProcessTable({ host: commonDirName, processes: new Map() }),
      pathInfo: defaultWorktreePathInfo,
    });

    expect(status.ok).toBe(true);
    if (!status.ok) throw new Error(status.error);
    expect(JSON.parse(status.value)).toEqual([{
      worktree: worktreeClaimName(worktreeRoot),
      status: OCCUPANCY_STATUS.FREE,
    }]);
  });

  it("rejects combining all targets with explicit worktree operands", async () => {
    const [worktreeName, otherWorktreeName] = sampleWorktreeTestValue(
      WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames(),
    );

    await withWorktreeLayoutEnv({ bare: true, worktrees: [{ name: worktreeName }] }, async (layout) => {
      const result = await statusCommand({
        all: true,
        worktrees: [layout.worktree(worktreeName), otherWorktreeName],
        cwd: layout.worktree(worktreeName),
        fs: defaultOccupancyFileSystem,
        gitDeps: defaultGitDependencies,
        processTable: createProcessTable({ host: otherWorktreeName, processes: new Map() }),
        pathInfo: defaultWorktreePathInfo,
      });

      expect(result).toEqual({ ok: false, error: WORKTREE_STATUS_ERROR.ALL_WITH_EXPLICIT_TARGETS });
    });
  });

  it("removes the running worktree's claim", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const selfPid = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.pid());
    const gitDeps = createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT });
    const name = worktreeClaimName(SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL);
    const processTable = createProcessTable({
      host: record.host,
      processes: new Map<number, ProcessTableEntry>([[record.pid, { alive: true, startTime: record.startedAt }]]),
    });

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, record, { fs: defaultOccupancyFileSystem, randomBytes });

      const result = await releaseCommand({
        cwd: SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL,
        env: { [CONTROLLING_PID_ENV]: String(record.pid) },
        fs: defaultOccupancyFileSystem,
        processTable,
        selfPid,
        sessionId: record.sessionId,
        worktreesDir,
        gitDeps,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);

      const after = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(after.ok).toBe(true);
      if (!after.ok) throw new Error(after.error);
      expect(after.value).toBeUndefined();
    });
  });

  it("removes a claim recorded with the normalized environment session id", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const rawSessionId = samplePathUnsafeAgentSessionIdentity();
    const normalizedSessionId = resolveAgentSessionId({ [AGENT_SESSION_ENV.CODEX_THREAD_ID]: rawSessionId });
    if (normalizedSessionId === undefined) throw new Error(SESSION_GENERATOR_ERROR.EMPTY_IDENTITY_SAMPLE);
    const record = {
      ...sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord()),
      sessionId: normalizedSessionId,
    };
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const selfPid = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.pid());
    const gitDeps = createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT });
    const name = worktreeClaimName(SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL);
    const processTable = createProcessTable({
      host: record.host,
      processes: new Map<number, ProcessTableEntry>([[record.pid, { alive: true, startTime: record.startedAt }]]),
    });

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, record, { fs: defaultOccupancyFileSystem, randomBytes });

      const result = await releaseCommand({
        cwd: SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL,
        env: {
          [AGENT_SESSION_ENV.CODEX_THREAD_ID]: rawSessionId,
          [CONTROLLING_PID_ENV]: String(record.pid),
        },
        fs: defaultOccupancyFileSystem,
        processTable,
        selfPid,
        worktreesDir,
        gitDeps,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);

      const after = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(after.ok).toBe(true);
      if (!after.ok) throw new Error(after.error);
      expect(after.value).toBeUndefined();
    });
  });

  it("shares a relative worktrees-dir scope across claim, status, and release", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const relativeWorktreesDir = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const name = worktreeClaimName(basename(env.worktreePath));
      const resolvedWorktreesDir = resolvePath(env.worktreePath, relativeWorktreesDir);

      const claim = await claimCommand({
        claimRandomBytes,
        sessionId,
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: relativeWorktreesDir,
        processTable: env.processTable,
        selfPid: holder.pid,
        env: { [CONTROLLING_PID_ENV]: String(holder.pid) },
      });
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);

      const written = await readClaim(resolvedWorktreesDir, name, { fs: env.fs });
      expect(written.ok).toBe(true);
      if (!written.ok) throw new Error(written.error);
      expect(written.value?.sessionId).toBe(sessionId);

      const status = await statusCommand({
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: relativeWorktreesDir,
        processTable: env.processTable,
        pathInfo: defaultWorktreePathInfo,
      });
      expect(status.ok).toBe(true);
      if (!status.ok) throw new Error(status.error);
      expect(status.value).toContain(
        `${WORKTREE_STATUS_RENDER.RUNNING_FALLBACK_RUNTIME} ${WORKTREE_STATUS_RENDER.RUNNING_WORD} [${holder.pid}]`,
      );

      const release = await releaseCommand({
        cwd: env.worktreePath,
        env: { [CONTROLLING_PID_ENV]: String(holder.pid) },
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        processTable: env.processTable,
        selfPid: holder.pid,
        sessionId,
        worktreesDir: relativeWorktreesDir,
      });
      expect(release.ok).toBe(true);
      if (!release.ok) throw new Error(release.error);

      const after = await readClaim(resolvedWorktreesDir, name, { fs: env.fs });
      expect(after.ok).toBe(true);
      if (!after.ok) throw new Error(after.error);
      expect(after.value).toBeUndefined();
    });
  });

  it("removes a claim recorded with the normalized explicit session id", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const rawSessionId = samplePathUnsafeAgentSessionIdentity();
    const normalizedSessionId = normalizeAgentSessionToken(rawSessionId);
    const record = {
      ...sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord()),
      sessionId: normalizedSessionId,
    };
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const selfPid = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.pid());
    const gitDeps = createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT });
    const name = worktreeClaimName(SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL);
    const processTable = createProcessTable({
      host: record.host,
      processes: new Map<number, ProcessTableEntry>([[record.pid, { alive: true, startTime: record.startedAt }]]),
    });

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, record, { fs: defaultOccupancyFileSystem, randomBytes });

      const result = await releaseCommand({
        cwd: SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL,
        env: { [CONTROLLING_PID_ENV]: String(record.pid) },
        fs: defaultOccupancyFileSystem,
        processTable,
        selfPid,
        sessionId: rawSessionId,
        worktreesDir,
        gitDeps,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);

      const after = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(after.ok).toBe(true);
      if (!after.ok) throw new Error(after.error);
      expect(after.value).toBeUndefined();
    });
  });

  it("refuses to remove a running worktree claim owned by a different session", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const [ownerSessionId, otherSessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
    const ownedRecord = { ...record, sessionId: ownerSessionId };
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const selfPid = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.pid());
    const gitDeps = createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT });
    const name = worktreeClaimName(SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL);
    const processTable = createProcessTable({
      host: ownedRecord.host,
      processes: new Map<number, ProcessTableEntry>([
        [ownedRecord.pid, { alive: true, startTime: ownedRecord.startedAt }],
      ]),
    });

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, ownedRecord, { fs: defaultOccupancyFileSystem, randomBytes });

      const result = await releaseCommand({
        cwd: SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL,
        env: { [CONTROLLING_PID_ENV]: String(ownedRecord.pid) },
        fs: defaultOccupancyFileSystem,
        processTable,
        selfPid,
        sessionId: otherSessionId,
        worktreesDir,
        gitDeps,
      });
      expect(result).toEqual({ ok: false, error: OCCUPANCY_ERROR.CLAIM_RELEASE_NOT_OWNER });

      const after = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(after.ok).toBe(true);
      if (!after.ok) throw new Error(after.error);
      expect(after.value).toEqual(ownedRecord);
    });
  });

  it("refuses release when no session identity resolves", async () => {
    const selfPid = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.pid());
    const gitDeps = createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT });
    const processTable = createProcessTable({
      host: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host()),
      processes: new Map<number, ProcessTableEntry>(),
    });

    const result = await releaseCommand({
      cwd: SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL,
      env: {},
      fs: defaultOccupancyFileSystem,
      processTable,
      selfPid,
      gitDeps,
    });

    expect(result).toEqual({ ok: false, error: WORKTREE_RELEASE_ERROR.SESSION_UNRESOLVED });
  });

  it("reports the current worktree's occupancy when no worktree argument is given", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

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

      const status = await statusCommand({
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        pathInfo: defaultWorktreePathInfo,
      });
      expect(status.ok).toBe(true);
      if (!status.ok) throw new Error(status.error);
      expect(status.value).toContain(
        `${WORKTREE_STATUS_RENDER.RUNNING_FALLBACK_RUNTIME} ${WORKTREE_STATUS_RENDER.RUNNING_WORD} [${holder.pid}]`,
      );
    });
  });

  it("resolves the claim scope from the target worktree, not the caller's directory", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const callerPrefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const probe = createProcessTable({
      host: holder.host,
      processes: new Map<number, ProcessTableEntry>([[holder.pid, { startTime: holder.startedAt, alive: true }]]),
    });

    await withWorktreeLayoutEnv({ bare: true, worktrees: [{ name: worktreeName }] }, async (layout) => {
      const worktreePath = layout.worktree(worktreeName);
      // Claim from the worktree with no explicit scope, so the claim is written
      // under the worktree's own git-common-dir `.spx/worktrees`.
      const claim = await claimCommand({
        claimRandomBytes,
        sessionId,
        cwd: worktreePath,
        fs: defaultOccupancyFileSystem,
        gitDeps: defaultGitDependencies,
        processTable: probe,
        selfPid: holder.pid,
        env: { [CONTROLLING_PID_ENV]: String(holder.pid) },
      });
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);

      await withTempDir(callerPrefix, async (callerDir) => {
        const status = await statusCommand({
          worktrees: [worktreePath],
          cwd: callerDir,
          fs: defaultOccupancyFileSystem,
          gitDeps: defaultGitDependencies,
          processTable: probe,
          pathInfo: defaultWorktreePathInfo,
        });
        expect(status.ok).toBe(true);
        if (!status.ok) throw new Error(status.error);
        expect(status.value).toContain(
          `${WORKTREE_STATUS_RENDER.RUNNING_FALLBACK_RUNTIME} ${WORKTREE_STATUS_RENDER.RUNNING_WORD} [${holder.pid}]`,
        );
      });
    });
  });
});
