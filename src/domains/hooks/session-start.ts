/**
 * Hook session-start payload and env-file helpers.
 *
 * @module domains/hooks/session-start
 */

import { resolve } from "node:path";

import type { Result } from "@/config/types";
import { AGENT_SESSION_KIND, type AgentSessionKind, isAgentSearchSessionKind } from "@/domains/agent/protocol";
import { parsePiHead } from "@/domains/agent/resume";
import { normalizeAgentSessionToken, resolveAgentSessionId } from "@/domains/session/agent-session";

export const HOOK_SESSION_START_PAYLOAD = {
  AGENT: "agent",
  CWD: "cwd",
  SESSION_ID: "session_id",
  SOURCE: "source",
  TRANSCRIPT_PATH: "transcript_path",
} as const;

// Agent lifecycle sources reported on the `session-start` payload. `compact`
// follows a transcript compaction that resets the loaded spec-tree foundation.
export const HOOK_SESSION_START_SOURCE = {
  CLEAR: "clear",
  COMPACT: "compact",
  RESUME: "resume",
  STARTUP: "startup",
} as const;

export const HOOK_SESSION_START_ENV = {
  CLAUDE_ENV_FILE: "CLAUDE_ENV_FILE",
  CLAUDE_PROJECT_DIR: "CLAUDE_PROJECT_DIR",
  CLAUDE_SESSION_ID: "CLAUDE_SESSION_ID",
  CODEX_THREAD_ID: "CODEX_THREAD_ID",
  PROJECT_DIR: "PROJECT_DIR",
  SPX_WORKTREE_CLAIM_PATH: "SPX_WORKTREE_CLAIM_PATH",
} as const;

export const HOOK_ENV_FILE = {
  ENCODING: "utf8",
  EXPORT_PREFIX: "export ",
  UNSET_PREFIX: "unset ",
} as const;

export const HOOK_SESSION_START_ERROR = {
  ENV_FILE_WRITE_FAILED: "hook session-start env file write failed",
  PAYLOAD_MALFORMED: "hook session-start payload must be a JSON object",
  PI_TRANSCRIPT_HEADER_INVALID: "hook session-start Pi transcript header is invalid",
  PI_TRANSCRIPT_PATH_REQUIRED: "hook session-start Pi transcript path is required",
  PI_TRANSCRIPT_PRODUCT_MISMATCH: "hook session-start Pi transcript product directory does not match",
  PI_TRANSCRIPT_READ_FAILED: "hook session-start Pi transcript read failed",
} as const;

export type HookSessionStartEnv = { readonly [key: string]: string | undefined };

export interface HookSessionStartPayload {
  readonly agent?: AgentSessionKind;
  readonly cwd?: string;
  readonly sessionId?: string;
  readonly source?: string;
  readonly transcriptPath?: string;
}

export interface HookSessionStartEnvRenderInput {
  readonly claimPath?: string;
  readonly productDir: string;
  readonly sessionId?: string;
}

export interface HookSessionStartStdoutInput {
  readonly compactStdout: boolean;
  readonly source?: string;
}

// `\w` matches exactly `[A-Za-z0-9_]` in JavaScript regexes; env-var names are ASCII.
const ENV_NAME_PATTERN = /^[A-Za-z_]\w*$/;
const SAFE_SHELL_VALUE_PATTERN = /^[A-Za-z0-9_@%+=:,.-]+$/;
const SINGLE_QUOTE = "'";
const SHELL_SINGLE_QUOTE_ESCAPE = "'\"'\"'";
const ENV_FILE_HEADER = "# Managed by spx hook run session-start";
const LINE_SEPARATOR = "\n";
const NO_STARTUP_DIRECTIVE = "";

export const HOOK_COMPACT_FOUNDATION_ACTION = {
  CONTEXTUALIZE: "/contextualize",
  UNDERSTAND: "/understand",
} as const;

export const HOOK_COMPACT_FOUNDATION_REASON =
  `Hook fired because the agent runtime reported ${HOOK_SESSION_START_PAYLOAD.SOURCE}=${HOOK_SESSION_START_SOURCE.COMPACT}.`;

export const HOOK_COMPACT_FOUNDATION_DIRECTIVE = [
  HOOK_COMPACT_FOUNDATION_REASON,
  "Spec-tree foundation was reset by this compaction.",
  `Before any spec-governed action, including resuming an in-flight PR, /apply, or /handoff, re-invoke ${HOOK_COMPACT_FOUNDATION_ACTION.UNDERSTAND} then ${HOOK_COMPACT_FOUNDATION_ACTION.CONTEXTUALIZE} on every spec node still in scope (not just the next one) before any gh/git archaeology or reading spec-governed source.`,
  "Skill text carried in the compaction summary is context only, outside active tool authority.",
].join(LINE_SEPARATOR);

export function parseHookSessionStartPayload(content: string | undefined): Result<HookSessionStartPayload> {
  if (content === undefined || content.trim().length === 0) return { ok: true, value: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, error: HOOK_SESSION_START_ERROR.PAYLOAD_MALFORMED };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: HOOK_SESSION_START_ERROR.PAYLOAD_MALFORMED };
  }

  const record = parsed as Record<string, unknown>;
  return {
    ok: true,
    value: {
      agent: agentSessionKind(record[HOOK_SESSION_START_PAYLOAD.AGENT]),
      cwd: nonEmptyString(record[HOOK_SESSION_START_PAYLOAD.CWD]),
      sessionId: nonEmptyString(record[HOOK_SESSION_START_PAYLOAD.SESSION_ID]),
      source: nonEmptyString(record[HOOK_SESSION_START_PAYLOAD.SOURCE]),
      transcriptPath: nonEmptyString(record[HOOK_SESSION_START_PAYLOAD.TRANSCRIPT_PATH]),
    },
  };
}

export function resolveHookSessionStartSessionId(
  payload: HookSessionStartPayload,
  env: HookSessionStartEnv,
): string | undefined {
  return payload.sessionId === undefined ? resolveAgentSessionId(env) : normalizeAgentSessionToken(payload.sessionId);
}

export function resolveHookSessionStartProductDir(payload: HookSessionStartPayload, cwd: string): string {
  return payload.cwd ?? cwd;
}

export function resolveHookPiSessionId(
  payload: HookSessionStartPayload,
  productDir: string,
  transcriptHead: string,
): Result<string> {
  if (payload.transcriptPath === undefined) {
    return { ok: false, error: HOOK_SESSION_START_ERROR.PI_TRANSCRIPT_PATH_REQUIRED };
  }
  const head = parsePiHead(transcriptHead);
  if (head === null) {
    return { ok: false, error: HOOK_SESSION_START_ERROR.PI_TRANSCRIPT_HEADER_INVALID };
  }
  if (resolve(head.cwd) !== resolve(productDir)) {
    return { ok: false, error: HOOK_SESSION_START_ERROR.PI_TRANSCRIPT_PRODUCT_MISMATCH };
  }
  return { ok: true, value: normalizeAgentSessionToken(head.sessionId) };
}

export function isPiHookSessionStartPayload(payload: HookSessionStartPayload): boolean {
  return payload.agent === AGENT_SESSION_KIND.PI;
}

/** Renders the model-visible stdout for the `session-start` hook event. */
export function renderSessionStartStdout(input: HookSessionStartStdoutInput): string {
  if (input.source !== HOOK_SESSION_START_SOURCE.COMPACT) return NO_STARTUP_DIRECTIVE;
  return input.compactStdout ? HOOK_COMPACT_FOUNDATION_DIRECTIVE : NO_STARTUP_DIRECTIVE;
}

export function resolveHookSessionStartEnvFile(
  env: HookSessionStartEnv,
  explicitEnvFile: string | undefined,
): string | undefined {
  return nonEmptyString(explicitEnvFile) ?? nonEmptyString(env[HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]);
}

export function renderHookSessionStartEnvFile(input: HookSessionStartEnvRenderInput): string {
  return [
    "",
    ENV_FILE_HEADER,
    ...(input.sessionId === undefined
      ? []
      : [renderExportLine(HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID, input.sessionId)]),
    renderExportLine(HOOK_SESSION_START_ENV.CLAUDE_PROJECT_DIR, input.productDir),
    renderExportLine(HOOK_SESSION_START_ENV.PROJECT_DIR, input.productDir),
    ...(input.claimPath === undefined
      ? [renderUnsetLine(HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH)]
      : [renderExportLine(HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH, input.claimPath)]),
    "",
  ].join(LINE_SEPARATOR);
}

function renderUnsetLine(name: string): string {
  if (!ENV_NAME_PATTERN.test(name)) throw new Error(`invalid environment variable name: ${name}`);
  return `${HOOK_ENV_FILE.UNSET_PREFIX}${name}`;
}

function renderExportLine(name: string, value: string): string {
  if (!ENV_NAME_PATTERN.test(name)) throw new Error(`invalid environment variable name: ${name}`);
  return `${HOOK_ENV_FILE.EXPORT_PREFIX}${name}=${shellQuote(value)}`;
}

function shellQuote(value: string): string {
  if (SAFE_SHELL_VALUE_PATTERN.test(value)) return value;
  return `${SINGLE_QUOTE}${value.replaceAll(SINGLE_QUOTE, SHELL_SINGLE_QUOTE_ESCAPE)}${SINGLE_QUOTE}`;
}

function agentSessionKind(value: unknown): AgentSessionKind | undefined {
  return typeof value === "string" && isAgentSearchSessionKind(value) ? value : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
