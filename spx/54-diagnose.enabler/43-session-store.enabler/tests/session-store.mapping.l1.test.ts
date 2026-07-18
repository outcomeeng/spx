import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  classifySessionStore,
  doingSessionBackedByClaim,
  SESSION_STORE_VERDICT,
  type SessionStoreReading,
} from "@/domains/diagnose/checks/session-store";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";
import { DEFAULT_SESSION_METADATA, type SessionRecord } from "@/domains/session/list";
import { SESSION_STATUSES } from "@/domains/session/types";
import { sessionCliDefinition } from "@/interfaces/cli/session/definition";
import { sampleDistinctSessionIds, sampleSessionId } from "@testing/generators/session/session";

const reading = (overrides: Partial<SessionStoreReading>): SessionStoreReading => ({
  errored: false,
  orphanedClaims: 0,
  ...overrides,
});

type DoingSessionRecord = SessionRecord & { readonly agent_session_id: string };

function doingSession(): DoingSessionRecord {
  const sessionIds = sampleDistinctSessionIds(2);
  return {
    id: sessionIds[0] ?? sampleSessionId(),
    status: SESSION_STATUSES[1],
    ...DEFAULT_SESSION_METADATA,
    specs: [],
    files: [],
    agent_session_id: sessionIds[1] ?? sampleSessionId(),
  };
}

function doingSessionWithoutAgentSessionId(): SessionRecord {
  return {
    id: sampleSessionId(),
    status: SESSION_STATUSES[1],
    ...DEFAULT_SESSION_METADATA,
    specs: [],
    files: [],
  };
}

describe("the session-store check classifies the store from sessions joined to occupancy", () => {
  it("classifies an errored reading as unknown (bucket unknown)", () => {
    const result = classifySessionStore(reading({ errored: true }));
    expect(result.verdict).toBe(SESSION_STORE_VERDICT.UNKNOWN);
    expect(result.bucket).toBe(VERDICT_BUCKET.UNKNOWN);
    expect(result.remediation.length).toBeGreaterThan(0);
    expect(result.remediation).not.toContain(
      `${sessionCliDefinition.domain.commandName} ${sessionCliDefinition.subcommands.release.commandName}`,
    );
  });

  it("classifies every successful orphan count as consistent and preserves the informational count", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99 }), (orphanedClaims) => {
        const result = classifySessionStore(reading({ orphanedClaims }));
        expect(result.verdict).toBe(SESSION_STORE_VERDICT.CONSISTENT);
        expect(result.bucket).toBe(VERDICT_BUCKET.HEALTHY);
        expect(result.readings.orphaned).toBe(String(orphanedClaims));
        expect(result.remediation.length).toBeGreaterThan(0);
        expect(result.remediation).not.toContain(
          `${sessionCliDefinition.domain.commandName} ${sessionCliDefinition.subcommands.release.commandName}`,
        );
      }),
    );
  });

  it("treats a live claim naming the session id as backing the doing session", () => {
    const session = doingSession();

    expect(doingSessionBackedByClaim(session, new Set([session.id]))).toBe(true);
  });

  it("treats a live claim naming the agent session id as backing the doing session", () => {
    const session = doingSession();

    expect(doingSessionBackedByClaim(session, new Set([session.agent_session_id]))).toBe(true);
  });

  it("treats a live claim naming the session id as backing a doing session without an agent session id", () => {
    const session = doingSessionWithoutAgentSessionId();

    expect(doingSessionBackedByClaim(session, new Set([session.id]))).toBe(true);
  });

  it("treats a doing session with no matching claim as orphaned", () => {
    const session = doingSession();

    expect(doingSessionBackedByClaim(session, new Set([]))).toBe(false);
  });

  it("treats a doing session without an agent session id and no matching claim as orphaned", () => {
    const session = doingSessionWithoutAgentSessionId();

    expect(doingSessionBackedByClaim(session, new Set([]))).toBe(false);
  });
});
