import { describe, expect, it } from "vitest";

import {
  classifySessionEnvironment,
  SESSION_ENVIRONMENT_VERDICT,
  type SessionEnvironmentReading,
} from "@/domains/diagnose/checks/session-environment";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";
import { HOOK_SESSION_START_ENV } from "@/domains/hooks/session-start";

const reading = (overrides: Partial<SessionEnvironmentReading>): SessionEnvironmentReading => ({
  errored: false,
  hookPresent: true,
  sessionIdentity: false,
  worktreeClaimed: false,
  ...overrides,
});

function expectedRemediationMarker(
  verdict: (typeof SESSION_ENVIRONMENT_VERDICT)[keyof typeof SESSION_ENVIRONMENT_VERDICT],
): string {
  switch (verdict) {
    case SESSION_ENVIRONMENT_VERDICT.WORKING:
      return "no action needed";
    case SESSION_ENVIRONMENT_VERDICT.IDENTITY_ONLY:
      return "worktree-claim step";
    case SESSION_ENVIRONMENT_VERDICT.SILENT_NO_OP:
      return HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH;
    case SESSION_ENVIRONMENT_VERDICT.NOT_APPLICABLE:
      return "configured and enabled";
    case SESSION_ENVIRONMENT_VERDICT.UNKNOWN:
      return "shared worktree occupancy";
  }
}

describe("the session-environment check classifies the SessionStart worktree occupancy", () => {
  it.each([
    {
      overrides: { hookPresent: false },
      verdict: SESSION_ENVIRONMENT_VERDICT.NOT_APPLICABLE,
      bucket: VERDICT_BUCKET.NOT_APPLICABLE,
    },
    {
      overrides: { errored: true },
      verdict: SESSION_ENVIRONMENT_VERDICT.UNKNOWN,
      bucket: VERDICT_BUCKET.UNKNOWN,
    },
    {
      overrides: { errored: true, hookPresent: false },
      verdict: SESSION_ENVIRONMENT_VERDICT.UNKNOWN,
      bucket: VERDICT_BUCKET.UNKNOWN,
    },
    {
      overrides: { errored: true, sessionIdentity: true },
      verdict: SESSION_ENVIRONMENT_VERDICT.UNKNOWN,
      bucket: VERDICT_BUCKET.UNKNOWN,
    },
    {
      overrides: { sessionIdentity: true, worktreeClaimed: true },
      verdict: SESSION_ENVIRONMENT_VERDICT.WORKING,
      bucket: VERDICT_BUCKET.HEALTHY,
    },
    {
      overrides: { hookPresent: false, sessionIdentity: true, worktreeClaimed: true },
      verdict: SESSION_ENVIRONMENT_VERDICT.WORKING,
      bucket: VERDICT_BUCKET.HEALTHY,
    },
    {
      overrides: { sessionIdentity: true },
      verdict: SESSION_ENVIRONMENT_VERDICT.IDENTITY_ONLY,
      bucket: VERDICT_BUCKET.DEGRADED,
    },
    {
      overrides: { hookPresent: false, sessionIdentity: true },
      verdict: SESSION_ENVIRONMENT_VERDICT.IDENTITY_ONLY,
      bucket: VERDICT_BUCKET.DEGRADED,
    },
    {
      overrides: {},
      verdict: SESSION_ENVIRONMENT_VERDICT.SILENT_NO_OP,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      overrides: { worktreeClaimed: true },
      verdict: SESSION_ENVIRONMENT_VERDICT.UNKNOWN,
      bucket: VERDICT_BUCKET.UNKNOWN,
    },
    {
      overrides: { hookPresent: false, worktreeClaimed: true },
      verdict: SESSION_ENVIRONMENT_VERDICT.UNKNOWN,
      bucket: VERDICT_BUCKET.UNKNOWN,
    },
  ])("classifies the session as $verdict (bucket $bucket)", ({ overrides, verdict, bucket }) => {
    const result = classifySessionEnvironment(reading(overrides));
    expect(result.verdict).toBe(verdict);
    expect(result.bucket).toBe(bucket);
    expect(result.remediation).toContain(expectedRemediationMarker(verdict));
  });

  it("describes silent no-op as a stale claim-path signal", () => {
    const result = classifySessionEnvironment(reading({}));
    expect(result.verdict).toBe(SESSION_ENVIRONMENT_VERDICT.SILENT_NO_OP);
    expect(result.remediation).toContain(HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH);
  });
});
