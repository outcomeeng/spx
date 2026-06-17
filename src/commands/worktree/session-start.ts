/**
 * `spx worktree session-start` handler — claims the running worktree from a
 * SessionStart hook payload and writes the hook env file.
 *
 * @module commands/worktree/session-start
 */

import { appendFile as nodeAppendFile } from "node:fs/promises";

import type { Result } from "@/config/types";
import { type ControllingProcessEnv } from "@/domains/worktree/controlling-process";
import { type OccupancyFileSystem } from "@/domains/worktree/occupancy-store";
import { type ProcessTable } from "@/domains/worktree/process-table";
import {
  parseWorktreeSessionStartPayload,
  renderWorktreeSessionStartEnvFile,
  resolveWorktreeSessionStartEnvFile,
  resolveWorktreeSessionStartProductDir,
  resolveWorktreeSessionStartSessionId,
  type WorktreeSessionStartEnv,
  WORKTREE_SESSION_START_ERROR,
  WORKTREE_SESSION_START_ENV_FILE,
} from "@/domains/worktree/session-start";

import { claimCommand } from "./claim";
import { type WorktreeScopeOptions } from "./resolve";

export interface WorktreeSessionStartFileSystem {
  appendFile(path: string, data: string, encoding: "utf8"): Promise<void>;
}

export interface SessionStartCommandResult {
  readonly claimed: boolean;
  readonly envFileWritten: boolean;
  readonly productDir: string;
  readonly sessionId?: string;
}

export interface SessionStartCommandOptions extends WorktreeScopeOptions {
  /** Raw SessionStart hook stdin JSON. */
  readonly content?: string;
  /** Explicit hook env file path. Defaults to `$CLAUDE_ENV_FILE`. */
  readonly envFile?: string;
  /** Environment read for session identity, env-file path, and controlling-pid override. */
  readonly env?: WorktreeSessionStartEnv & ControllingProcessEnv;
  /** Injected process table. Defaults to the real process table through claimCommand. */
  readonly processTable?: ProcessTable;
  /** spx's own pid, the ancestry walk starts above. Defaults to claimCommand's process pid. */
  readonly selfPid?: number;
  /** Injected claim filesystem. */
  readonly fs?: OccupancyFileSystem;
  /** Injected env-file filesystem. */
  readonly envFileSystem?: WorktreeSessionStartFileSystem;
}

const defaultSessionStartFileSystem: WorktreeSessionStartFileSystem = {
  appendFile: async (path, data, encoding) => {
    await nodeAppendFile(path, data, encoding);
  },
};

const ERROR_DETAIL_SEPARATOR = ": ";

/** Claims the worktree once from SessionStart input and appends hook env exports. */
export async function sessionStartCommand(options: SessionStartCommandOptions): Promise<Result<SessionStartCommandResult>> {
  const payloadResult = parseWorktreeSessionStartPayload(options.content);
  if (!payloadResult.ok) return payloadResult;

  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const productDir = resolveWorktreeSessionStartProductDir(payloadResult.value, cwd);
  const sessionId = resolveWorktreeSessionStartSessionId(payloadResult.value, env);

  let claimed = false;
  if (sessionId !== undefined) {
    const claim = await claimCommand({
      ...options,
      cwd: productDir,
      env,
      sessionId,
    });
    claimed = claim.ok;
  }

  const envFile = resolveWorktreeSessionStartEnvFile(env, options.envFile);
  const envFileWritten = await writeEnvFileIfConfigured({
    claimed,
    envFile,
    productDir,
    sessionId,
    envFileSystem: options.envFileSystem ?? defaultSessionStartFileSystem,
  });
  if (!envFileWritten.ok) return envFileWritten;

  return {
    ok: true,
    value: {
      claimed,
      envFileWritten: envFileWritten.value,
      productDir,
      ...(sessionId === undefined ? {} : { sessionId }),
    },
  };
}

async function writeEnvFileIfConfigured(options: {
  readonly claimed: boolean;
  readonly envFile: string | undefined;
  readonly productDir: string;
  readonly sessionId: string | undefined;
  readonly envFileSystem: WorktreeSessionStartFileSystem;
}): Promise<Result<boolean>> {
  if (options.envFile === undefined || options.sessionId === undefined) return { ok: true, value: false };

  try {
    await options.envFileSystem.appendFile(
      options.envFile,
      renderWorktreeSessionStartEnvFile({
        claimed: options.claimed,
        productDir: options.productDir,
        sessionId: options.sessionId,
      }),
      WORKTREE_SESSION_START_ENV_FILE.ENCODING,
    );
    return { ok: true, value: true };
  } catch (error) {
    return {
      ok: false,
      error: `${WORKTREE_SESSION_START_ERROR.ENV_FILE_WRITE_FAILED}${ERROR_DETAIL_SEPARATOR}${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
