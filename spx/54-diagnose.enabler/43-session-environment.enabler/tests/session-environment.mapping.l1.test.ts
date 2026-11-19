import { describe, expect, it } from "vitest";

import {
  classifySessionEnvironment,
  SESSION_ENVIRONMENT_REMEDIATION,
  SESSION_ENVIRONMENT_VERDICT,
} from "@/domains/diagnose/checks/session-environment";
import { HOOK_SESSION_START_ENV } from "@/domains/hooks/session-start";
import { sessionEnvironmentReadingCases } from "@testing/generators/diagnose/session-environment";

describe("the session-environment check classifies the SessionStart worktree occupancy", () => {
  it.each(sessionEnvironmentReadingCases())(
    "classifies reading $reading as $verdict (bucket $bucket)",
    ({ reading, verdict, bucket }) => {
      const result = classifySessionEnvironment(reading);
      expect(result.verdict).toBe(verdict);
      expect(result.bucket).toBe(bucket);
      expect(result.remediation).toBe(SESSION_ENVIRONMENT_REMEDIATION[verdict]);
    },
  );

  it.each(
    sessionEnvironmentReadingCases().filter(({ verdict }) => verdict === SESSION_ENVIRONMENT_VERDICT.SILENT_NO_OP),
  )("describes silent no-op reading $reading as a stale claim-path signal", ({ reading }) => {
    const result = classifySessionEnvironment(reading);
    expect(result.verdict).toBe(SESSION_ENVIRONMENT_VERDICT.SILENT_NO_OP);
    expect(result.remediation).toContain(HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH);
  });
});
