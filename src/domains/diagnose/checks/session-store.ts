/**
 * The session-store diagnose check — reports the `.spx/` session store from
 * `spx session list` joined to the shared worktree pool snapshot's live claim
 * set. The orphan count remains informational; classification is pure over the
 * gathered reading, which is obtained through a dependency-injected probe.
 *
 * @module domains/diagnose/checks/session-store
 */

import type { CheckRunner } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { type CheckRecord, VERDICT_BUCKET } from "@/domains/diagnose/types";
import { normalizeAgentSessionToken } from "@/domains/session/agent-session";
import type { SessionRecord } from "@/domains/session/list";

/** The session-store verdict labels. */
export const SESSION_STORE_VERDICT = {
  CONSISTENT: "consistent",
  UNKNOWN: "unknown",
} as const;

export type SessionStoreVerdict = (typeof SESSION_STORE_VERDICT)[keyof typeof SESSION_STORE_VERDICT];

/** The reading the probe gathers about the session store. */
export interface SessionStoreReading {
  /** True when a command errored. */
  readonly errored: boolean;
  /** Informational count of doing sessions without a matching live claim. */
  readonly orphanedClaims: number;
}

/** The injected boundary that gathers the session-store reading. */
export interface SessionStoreProbe {
  probe(): Promise<SessionStoreReading>;
}

/** Returns true when a live worktree claim can be joined to a doing session. */
export function doingSessionBackedByClaim(session: SessionRecord, claimedSessionIds: ReadonlySet<string>): boolean {
  if (claimedSessionIds.has(normalizeAgentSessionToken(session.id))) return true;
  return session.agent_session_id !== undefined
    && claimedSessionIds.has(normalizeAgentSessionToken(session.agent_session_id));
}

const REMEDIATION: Readonly<Record<SessionStoreVerdict, string>> = {
  [SESSION_STORE_VERDICT.CONSISTENT]: "Session store is consistent; no action needed.",
  [SESSION_STORE_VERDICT.UNKNOWN]: "Re-run diagnose; if it persists, inspect spx session list and occupancy claims.",
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
  return record(SESSION_STORE_VERDICT.CONSISTENT, VERDICT_BUCKET.HEALTHY, reading);
}

/** Builds the session-store check runner over an injected probe. */
export function sessionStoreRunner(probe: SessionStoreProbe): CheckRunner {
  return async () => classifySessionStore(await probe.probe());
}
