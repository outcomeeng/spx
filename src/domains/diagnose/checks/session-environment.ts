/**
 * The session-environment diagnose check — classifies the agent session the
 * spec-tree `SessionStart` hook establishes from the agent session identity, the
 * worktree-claim flag, and the current worktree's shared snapshot occupancy.
 * The classification is pure over the gathered reading; the reading is
 * obtained through a dependency-injected probe.
 *
 * @module domains/diagnose/checks/session-environment
 */

import type { CheckRunner } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { type CheckRecord, VERDICT_BUCKET } from "@/domains/diagnose/types";

/** The session-environment verdict labels. */
export const SESSION_ENVIRONMENT_VERDICT = {
  WORKING: "working",
  IDENTITY_ONLY: "identity-only",
  SILENT_NO_OP: "silent-no-op",
  NOT_APPLICABLE: "not-applicable",
  UNKNOWN: "unknown",
} as const;

export type SessionEnvironmentVerdict = (typeof SESSION_ENVIRONMENT_VERDICT)[keyof typeof SESSION_ENVIRONMENT_VERDICT];

/** The reading the probe gathers about the session environment. */
export interface SessionEnvironmentReading {
  /** True when a command errored. */
  readonly errored: boolean;
  /** True when the runtime ships a spec-tree `SessionStart` hook. */
  readonly hookPresent: boolean;
  /** True when the agent session identity resolved. */
  readonly sessionIdentity: boolean;
  /** True when the current worktree reads `running` — a live process holds its claim. */
  readonly worktreeClaimed: boolean;
}

/** The injected boundary that gathers the session-environment reading. */
export interface SessionEnvironmentProbe {
  probe(): Promise<SessionEnvironmentReading>;
}

const REMEDIATION: Readonly<Record<SessionEnvironmentVerdict, string>> = {
  [SESSION_ENVIRONMENT_VERDICT.WORKING]: "Session environment is established; no action needed.",
  [SESSION_ENVIRONMENT_VERDICT.IDENTITY_ONLY]:
    "The SessionStart hook set the session identity but did not claim the worktree; check the worktree-claim step.",
  [SESSION_ENVIRONMENT_VERDICT.SILENT_NO_OP]:
    "The SessionStart hook ran without effect; verify the hook resolves spx and the agent session id.",
  [SESSION_ENVIRONMENT_VERDICT.NOT_APPLICABLE]:
    "No SessionStart hook signal or agent session identity was observed; confirm a spec-tree SessionStart hook is configured and enabled.",
  [SESSION_ENVIRONMENT_VERDICT.UNKNOWN]:
    "Re-run diagnose; if it persists, inspect the agent session id and shared worktree occupancy.",
};

function record(
  verdict: SessionEnvironmentVerdict,
  bucket: CheckRecord["bucket"],
  reading: SessionEnvironmentReading,
): CheckRecord {
  return {
    name: CHECK_NAME.SESSION_ENVIRONMENT,
    verdict,
    bucket,
    readings: {
      hook: String(reading.hookPresent),
      identity: String(reading.sessionIdentity),
      claimed: String(reading.worktreeClaimed),
    },
    remediation: REMEDIATION[verdict],
  };
}

/** Classifies the session-environment reading into a check record. */
export function classifySessionEnvironment(reading: SessionEnvironmentReading): CheckRecord {
  if (reading.errored) {
    return record(SESSION_ENVIRONMENT_VERDICT.UNKNOWN, VERDICT_BUCKET.UNKNOWN, reading);
  }
  if (reading.sessionIdentity && reading.worktreeClaimed) {
    return record(SESSION_ENVIRONMENT_VERDICT.WORKING, VERDICT_BUCKET.HEALTHY, reading);
  }
  if (reading.sessionIdentity) {
    return record(SESSION_ENVIRONMENT_VERDICT.IDENTITY_ONLY, VERDICT_BUCKET.DEGRADED, reading);
  }
  if (reading.hookPresent && !reading.worktreeClaimed) {
    return record(SESSION_ENVIRONMENT_VERDICT.SILENT_NO_OP, VERDICT_BUCKET.BROKEN, reading);
  }
  if (!reading.hookPresent && !reading.worktreeClaimed) {
    return record(SESSION_ENVIRONMENT_VERDICT.NOT_APPLICABLE, VERDICT_BUCKET.NOT_APPLICABLE, reading);
  }
  return record(SESSION_ENVIRONMENT_VERDICT.UNKNOWN, VERDICT_BUCKET.UNKNOWN, reading);
}

/** Builds the session-environment check runner over an injected probe. */
export function sessionEnvironmentRunner(probe: SessionEnvironmentProbe): CheckRunner {
  return async () => classifySessionEnvironment(await probe.probe());
}
