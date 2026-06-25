import { describe, expect, it } from "vitest";

import {
  classifySessionEnvironment,
  SESSION_ENVIRONMENT_VERDICT,
  type SessionEnvironmentReading,
} from "@/domains/diagnose/checks/session-environment";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";

const reading = (overrides: Partial<SessionEnvironmentReading>): SessionEnvironmentReading => ({
  errored: false,
  hookPresent: true,
  sessionIdentity: false,
  worktreeClaimed: false,
  ...overrides,
});

describe("the session-environment check classifies the SessionStart worktree occupancy", () => {
  it.each([
    {
      overrides: { hookPresent: false },
      verdict: SESSION_ENVIRONMENT_VERDICT.NOT_APPLICABLE,
      bucket: VERDICT_BUCKET.NOT_APPLICABLE,
    },
    { overrides: { errored: true }, verdict: SESSION_ENVIRONMENT_VERDICT.UNKNOWN, bucket: VERDICT_BUCKET.UNKNOWN },
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
    { overrides: {}, verdict: SESSION_ENVIRONMENT_VERDICT.SILENT_NO_OP, bucket: VERDICT_BUCKET.BROKEN },
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
    expect(result.remediation.length).toBeGreaterThan(0);
  });
});
