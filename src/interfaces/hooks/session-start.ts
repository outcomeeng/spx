/**
 * `session-start` hook adapter.
 *
 * @module interfaces/hooks/session-start
 */

import { appendFile as nodeAppendFile } from "node:fs/promises";

import type { Result } from "@/config/types";
import {
  HOOK_ENV_FILE,
  HOOK_SESSION_START_ERROR,
  type HookSessionStartEnv,
  parseHookSessionStartPayload,
  renderHookSessionStartEnvFile,
  renderSessionStartStdout,
  resolveHookSessionStartProductDir,
  resolveHookSessionStartSessionId,
} from "@/domains/hooks/session-start";
import { claimWorktreeOccupancy } from "@/domains/worktree/claim";
import type { ControllingProcessEnv } from "@/domains/worktree/controlling-process";
import type { OccupancyFileSystem } from "@/domains/worktree/occupancy-store";
import type { ProcessTable } from "@/domains/worktree/process-table";
import type { WorktreeScopeOptions } from "@/domains/worktree/resolve";
import type { RandomBytes } from "@/lib/atomic-file-write";

export interface HookEnvFileSystem {
  appendFile(path: string, data: string, encoding: "utf8"): Promise<void>;
}

export interface HookTranscriptFileSystem {
  readHead(path: string, maxBytes: number): Promise<string>;
}

export interface HookEventResult {
  readonly diagnostics: readonly string[];
  readonly stdout: string;
}

export interface SessionStartHookResult extends HookEventResult {
  readonly claimed: boolean;
  readonly claimPath?: string;
  readonly envFileWritten: boolean;
  readonly productDir: string;
  readonly sessionId?: string;
}

export interface SessionStartHookOptions extends WorktreeScopeOptions {
  /** Resolved per-runtime compact stdout policy. */
  readonly compactStdout: boolean;
  /** Raw hook stdin JSON. */
  readonly content?: string;
  /** Random bytes source used for the atomic claim temp path. */
  readonly claimRandomBytes: RandomBytes;
  /** Resolved hook env file path. */
  readonly envFile?: string;
  /** Environment read for session identity, env-file path, and controlling-pid override. */
  readonly env: HookSessionStartEnv & ControllingProcessEnv;
  /** Injected process table. */
  readonly processTable: ProcessTable;
  /** spx's own pid, the ancestry walk starts above. */
  readonly selfPid: number;
  /** Injected claim filesystem. */
  readonly fs: OccupancyFileSystem;
  /** Injected env-file filesystem. */
  readonly envFileSystem?: HookEnvFileSystem;
  /** Injected bounded transcript reader for native session identity. */
  readonly transcriptFileSystem?: HookTranscriptFileSystem;
}

const defaultHookEnvFileSystem: HookEnvFileSystem = {
  appendFile: async (path, data, encoding) => {
    await nodeAppendFile(path, data, encoding);
  },
};

const ERROR_DETAIL_SEPARATOR = ": ";

/** Runs the `session-start` hook event without blocking startup on degraded responsibilities. */
export async function runSessionStartHook(options: SessionStartHookOptions): Promise<Result<SessionStartHookResult>> {
  const diagnostics: string[] = [];
  const payloadResult = parseHookSessionStartPayload(options.content);
  if (!payloadResult.ok) {
    diagnostics.push(payloadResult.error);
  }

  const payload = payloadResult.ok ? payloadResult.value : {};
  const productDir = resolveHookSessionStartProductDir(payload, options.cwd);
  const sessionId = resolveHookSessionStartSessionId(payload, options.env);

  let claimPath: string | undefined;
  if (sessionId !== undefined) {
    const claim = await claimWorktreeOccupancy({
      ...options,
      cwd: productDir,
      sessionId,
    });
    if (claim.ok) {
      claimPath = claim.value;
    } else {
      diagnostics.push(claim.error);
    }
  }

  const envFileWritten = await writeEnvFileIfConfigured({
    claimPath,
    envFile: options.envFile,
    productDir,
    sessionId,
    envFileSystem: options.envFileSystem ?? defaultHookEnvFileSystem,
    diagnostics,
  });

  return {
    ok: true,
    value: {
      claimed: claimPath !== undefined,
      diagnostics,
      envFileWritten,
      productDir,
      stdout: renderSessionStartStdout({
        compactStdout: options.compactStdout,
        source: payload.source,
      }),
      ...(claimPath === undefined ? {} : { claimPath }),
      ...(sessionId === undefined ? {} : { sessionId }),
    },
  };
}

async function writeEnvFileIfConfigured(options: {
  readonly claimPath: string | undefined;
  readonly envFile: string | undefined;
  readonly productDir: string;
  readonly sessionId: string | undefined;
  readonly envFileSystem: HookEnvFileSystem;
  readonly diagnostics: string[];
}): Promise<boolean> {
  if (options.envFile === undefined) return false;

  try {
    await options.envFileSystem.appendFile(
      options.envFile,
      renderHookSessionStartEnvFile({
        claimPath: options.claimPath,
        productDir: options.productDir,
        sessionId: options.sessionId,
      }),
      HOOK_ENV_FILE.ENCODING,
    );
    return true;
  } catch (error) {
    options.diagnostics.push(
      `${HOOK_SESSION_START_ERROR.ENV_FILE_WRITE_FAILED}${ERROR_DETAIL_SEPARATOR}${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}
