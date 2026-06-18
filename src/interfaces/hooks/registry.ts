/**
 * Hook event registry.
 *
 * @module interfaces/hooks/registry
 */

import type { Result } from "@/config/types";

import { type HookEventResult, runSessionStartHook, type SessionStartHookOptions } from "./session-start";

export const HOOK_EVENT = {
  SESSION_START: "session-start",
} as const;

export const HOOK_ERROR = {
  UNKNOWN_EVENT: "unknown hook event",
} as const;

export type HookEvent = (typeof HOOK_EVENT)[keyof typeof HOOK_EVENT];

export interface RunHookEventOptions extends SessionStartHookOptions {
  readonly event: string;
}

export function hookEventNames(): readonly HookEvent[] {
  return [HOOK_EVENT.SESSION_START];
}

export function isHookEvent(event: string): event is HookEvent {
  return hookEventNames().some((registered) => registered === event);
}

export async function runHookEvent(options: RunHookEventOptions): Promise<Result<HookEventResult>> {
  if (options.event === HOOK_EVENT.SESSION_START) return runSessionStartHook(options);
  return { ok: false, error: `${HOOK_ERROR.UNKNOWN_EVENT}: ${options.event}` };
}
