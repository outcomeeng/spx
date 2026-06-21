/**
 * Hook session-start payload and env-file helpers.
 *
 * @module domains/hooks/session-start
 */

import type { Result } from "@/config/types";

export const HOOK_SESSION_START_PAYLOAD = {
  CWD: "cwd",
  SESSION_ID: "session_id",
} as const;

export const HOOK_SESSION_START_ENV = {
  CLAUDE_ENV_FILE: "CLAUDE_ENV_FILE",
  CLAUDE_PROJECT_DIR: "CLAUDE_PROJECT_DIR",
  CLAUDE_SESSION_ID: "CLAUDE_SESSION_ID",
  CLAUDE_WORKTREE_CLAIMED: "CLAUDE_WORKTREE_CLAIMED",
  CODEX_THREAD_ID: "CODEX_THREAD_ID",
  PROJECT_DIR: "PROJECT_DIR",
} as const;

export const HOOK_SESSION_START_CLAIMED = {
  FALSE: "0",
  TRUE: "1",
} as const;

export const HOOK_ENV_FILE = {
  ENCODING: "utf8",
  EXPORT_PREFIX: "export ",
} as const;

export const HOOK_SESSION_START_ERROR = {
  ENV_FILE_WRITE_FAILED: "hook session-start env file write failed",
  PAYLOAD_MALFORMED: "hook session-start payload must be a JSON object",
} as const;

export type HookSessionStartEnv = { readonly [key: string]: string | undefined };

export interface HookSessionStartPayload {
  readonly cwd?: string;
  readonly sessionId?: string;
}

export interface HookSessionStartEnvRenderInput {
  readonly claimed: boolean;
  readonly productDir: string;
  readonly sessionId?: string;
}

// `\w` matches exactly `[A-Za-z0-9_]` in JavaScript regexes; env-var names are ASCII.
const ENV_NAME_PATTERN = /^[A-Za-z_]\w*$/;
const SAFE_SHELL_VALUE_PATTERN = /^[A-Za-z0-9_@%+=:,.-]+$/;
const SINGLE_QUOTE = "'";
const SHELL_SINGLE_QUOTE_ESCAPE = "'\"'\"'";
const ENV_FILE_HEADER = "# Managed by spx hook run session-start";
const LINE_SEPARATOR = "\n";

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
      cwd: nonEmptyString(record[HOOK_SESSION_START_PAYLOAD.CWD]),
      sessionId: nonEmptyString(record[HOOK_SESSION_START_PAYLOAD.SESSION_ID]),
    },
  };
}

export function resolveHookSessionStartSessionId(
  payload: HookSessionStartPayload,
  env: HookSessionStartEnv,
): string | undefined {
  return (
    payload.sessionId
      ?? nonEmptyString(env[HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID])
      ?? nonEmptyString(env[HOOK_SESSION_START_ENV.CODEX_THREAD_ID])
  );
}

export function resolveHookSessionStartProductDir(payload: HookSessionStartPayload, cwd: string): string {
  return payload.cwd ?? cwd;
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
    renderExportLine(
      HOOK_SESSION_START_ENV.CLAUDE_WORKTREE_CLAIMED,
      input.claimed ? HOOK_SESSION_START_CLAIMED.TRUE : HOOK_SESSION_START_CLAIMED.FALSE,
    ),
    "",
  ].join(LINE_SEPARATOR);
}

function renderExportLine(name: string, value: string): string {
  if (!ENV_NAME_PATTERN.test(name)) throw new Error(`invalid environment variable name: ${name}`);
  return `${HOOK_ENV_FILE.EXPORT_PREFIX}${name}=${shellQuote(value)}`;
}

function shellQuote(value: string): string {
  if (SAFE_SHELL_VALUE_PATTERN.test(value)) return value;
  return `${SINGLE_QUOTE}${value.replaceAll(SINGLE_QUOTE, SHELL_SINGLE_QUOTE_ESCAPE)}${SINGLE_QUOTE}`;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
