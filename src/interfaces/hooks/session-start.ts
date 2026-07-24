/**
 * `session-start` hook adapter.
 *
 * @module interfaces/hooks/session-start
 */

import { appendFile as nodeAppendFile, open as nodeOpen, realpath as nodeRealPath } from "node:fs/promises";

import type { Result } from "@/config/types";
import { resolveAgentHomeDirs } from "@/domains/agent/home";
import { AGENT_RESUME_LIMITS, AGENT_SESSION_STORE } from "@/domains/agent/protocol";
import {
  HOOK_ENV_FILE,
  HOOK_SESSION_START_ERROR,
  type HookSessionStartEnv,
  type HookSessionStartPayload,
  isPiHookSessionStartPayload,
  parseHookSessionStartPayload,
  PI_SESSION_START_REJECTION_REGISTRY,
  renderHookSessionStartEnvFile,
  renderSessionStartStdout,
  resolveHookPiSessionId,
  resolveHookSessionStartProductDir,
  resolveHookSessionStartSessionId,
} from "@/domains/hooks/session-start";
import { claimWorktreeOccupancy } from "@/domains/worktree/claim";
import type { ControllingProcessEnv } from "@/domains/worktree/controlling-process";
import type { OccupancyFileSystem } from "@/domains/worktree/occupancy-store";
import type { ProcessTable } from "@/domains/worktree/process-table";
import type { WorktreeScopeOptions } from "@/domains/worktree/resolve";
import type { RandomBytes } from "@/lib/atomic-file-write";
import { isPathContained } from "@/lib/file-system/pathContainment";

export interface HookEnvFileSystem {
  appendFile(path: string, data: string, encoding: "utf8"): Promise<void>;
}

export interface HookTranscriptFileSystem {
  realPath(path: string): Promise<string>;
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

const defaultHookTranscriptFileSystem: HookTranscriptFileSystem = {
  realPath: nodeRealPath,
  async readHead(path, maxBytes) {
    const handle = await nodeOpen(path, "r");
    try {
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
      return buffer.toString(AGENT_SESSION_STORE.TEXT_ENCODING, 0, bytesRead);
    } finally {
      await handle.close();
    }
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
  const sessionId = await resolveSessionStartSessionId({
    diagnostics,
    env: options.env,
    payload,
    productDir,
    transcriptFileSystem: options.transcriptFileSystem ?? defaultHookTranscriptFileSystem,
  });

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

async function resolveSessionStartSessionId(options: {
  readonly diagnostics: string[];
  readonly env: HookSessionStartEnv;
  readonly payload: HookSessionStartPayload;
  readonly productDir: string;
  readonly transcriptFileSystem: HookTranscriptFileSystem;
}): Promise<string | undefined> {
  if (options.payload.sessionId !== undefined || !isPiHookSessionStartPayload(options.payload)) {
    return resolveHookSessionStartSessionId(options.payload, options.env);
  }
  if (options.payload.transcriptPath === undefined) {
    options.diagnostics.push(PI_SESSION_START_REJECTION_REGISTRY.pathRequired.diagnostic);
    return undefined;
  }

  const trustedPath = await isTrustedPiTranscriptPath(
    resolveAgentHomeDirs(options.env).piSessions,
    options.payload.transcriptPath,
    options.transcriptFileSystem,
  );
  if (!trustedPath.ok) {
    options.diagnostics.push(
      `${PI_SESSION_START_REJECTION_REGISTRY.readFailed.diagnostic}${ERROR_DETAIL_SEPARATOR}${trustedPath.error}`,
    );
    return undefined;
  }
  if (!trustedPath.value) {
    options.diagnostics.push(PI_SESSION_START_REJECTION_REGISTRY.pathUntrusted.diagnostic);
    return undefined;
  }

  let transcriptHead: string;
  try {
    transcriptHead = await options.transcriptFileSystem.readHead(
      trustedPath.value,
      AGENT_RESUME_LIMITS.METADATA_HEAD_BYTES,
    );
  } catch (error) {
    options.diagnostics.push(
      `${PI_SESSION_START_REJECTION_REGISTRY.readFailed.diagnostic}${ERROR_DETAIL_SEPARATOR}${describeError(error)}`,
    );
    return undefined;
  }

  const result = resolveHookPiSessionId(options.payload, options.productDir, transcriptHead);
  if (!result.ok) {
    options.diagnostics.push(result.error);
    return undefined;
  }
  return result.value;
}

async function isTrustedPiTranscriptPath(
  sessionStoreDir: string,
  transcriptPath: string,
  fs: HookTranscriptFileSystem,
): Promise<Result<string | undefined>> {
  try {
    const [canonicalStore, canonicalTranscript] = await Promise.all([
      fs.realPath(sessionStoreDir),
      fs.realPath(transcriptPath),
    ]);
    return {
      ok: true,
      value: isPathContained(canonicalStore, canonicalTranscript) ? canonicalTranscript : undefined,
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
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
      `${HOOK_SESSION_START_ERROR.ENV_FILE_WRITE_FAILED}${ERROR_DETAIL_SEPARATOR}${describeError(error)}`,
    );
    return false;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
