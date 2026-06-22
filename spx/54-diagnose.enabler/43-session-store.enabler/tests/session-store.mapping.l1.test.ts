import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  classifySessionStore,
  SESSION_STORE_VERDICT,
  type SessionStoreReading,
} from "@/domains/diagnose/checks/session-store";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";

const reading = (overrides: Partial<SessionStoreReading>): SessionStoreReading => ({
  errored: false,
  orphanedClaims: 0,
  ...overrides,
});

describe("the session-store check classifies the store from sessions joined to occupancy", () => {
  it("classifies an errored reading as unknown (bucket unknown)", () => {
    const result = classifySessionStore(reading({ errored: true }));
    expect(result.verdict).toBe(SESSION_STORE_VERDICT.UNKNOWN);
    expect(result.bucket).toBe(VERDICT_BUCKET.UNKNOWN);
    expect(result.remediation.length).toBeGreaterThan(0);
  });

  it("classifies no orphaned claims as consistent (bucket healthy)", () => {
    const result = classifySessionStore(reading({ orphanedClaims: 0 }));
    expect(result.verdict).toBe(SESSION_STORE_VERDICT.CONSISTENT);
    expect(result.bucket).toBe(VERDICT_BUCKET.HEALTHY);
    expect(result.remediation.length).toBeGreaterThan(0);
  });

  it("classifies any orphaned claim as orphaned-claims (bucket degraded)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99 }), (orphanedClaims) => {
        const result = classifySessionStore(reading({ orphanedClaims }));
        expect(result.verdict).toBe(SESSION_STORE_VERDICT.ORPHANED_CLAIMS);
        expect(result.bucket).toBe(VERDICT_BUCKET.DEGRADED);
        expect(result.remediation.length).toBeGreaterThan(0);
      }),
    );
  });
});
