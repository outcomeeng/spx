/**
 * The session-store diagnose check — classifies the `.spx/` session store from
 * `spx session list` joined to the `spx worktree status` occupancy backing each
 * doing claim. The classification is pure over the gathered reading; the reading
 * is obtained through a dependency-injected probe.
 *
 * @module domains/diagnose/checks/session-store
 */

import type { CheckRunner } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { type CheckRecord, VERDICT_BUCKET } from "@/domains/diagnose/types";

/** The session-store verdict labels. */
export const SESSION_STORE_VERDICT = {
  CONSISTENT: "consistent",
  ORPHANED_CLAIMS: "orphaned-claims",
  UNKNOWN: "unknown",
} as const;

export type SessionStoreVerdict = (typeof SESSION_STORE_VERDICT)[keyof typeof SESSION_STORE_VERDICT];

/** The reading the probe gathers about the session store. */
export interface SessionStoreReading {
  /** True when a command errored. */
  readonly errored: boolean;
  /** The number of doing sessions whose backing worktree reads `free` or is absent. */
  readonly orphanedClaims: number;
}

/** The injected boundary that gathers the session-store reading. */
export interface SessionStoreProbe {
  probe(): Promise<SessionStoreReading>;
}

const REMEDIATION: Readonly<Record<SessionStoreVerdict, string>> = {
  [SESSION_STORE_VERDICT.CONSISTENT]: "Session store is consistent; no action needed.",
  [SESSION_STORE_VERDICT.ORPHANED_CLAIMS]:
    "Release or reclaim doing sessions whose backing worktree reads free or is absent (spx session release).",
  [SESSION_STORE_VERDICT.UNKNOWN]: "Re-run diagnose; if it persists, inspect spx session list and spx worktree status.",
};

function record(
  verdict: SessionStoreVerdict,
  bucket: CheckRecord["bucket"],
  reading: SessionStoreReading,
): CheckRecord {
  return {
    name: CHECK_NAME.SESSION_STORE,
    verdict,
    bucket,
    readings: {
      orphaned: String(reading.orphanedClaims),
    },
    remediation: REMEDIATION[verdict],
  };
}

/** Classifies the session-store reading into a check record. */
export function classifySessionStore(reading: SessionStoreReading): CheckRecord {
  if (reading.errored) {
    return record(SESSION_STORE_VERDICT.UNKNOWN, VERDICT_BUCKET.UNKNOWN, reading);
  }
  if (reading.orphanedClaims > 0) {
    return record(SESSION_STORE_VERDICT.ORPHANED_CLAIMS, VERDICT_BUCKET.DEGRADED, reading);
  }
  return record(SESSION_STORE_VERDICT.CONSISTENT, VERDICT_BUCKET.HEALTHY, reading);
}

/** Builds the session-store check runner over an injected probe. */
export function sessionStoreRunner(probe: SessionStoreProbe): CheckRunner {
  return async () => classifySessionStore(await probe.probe());
}
