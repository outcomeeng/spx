import { describe, expect, it } from "vitest";

import { sessionEnvironmentReadingFromSnapshot } from "@/commands/diagnose/probes";
import {
  classifySessionEnvironment,
  SESSION_ENVIRONMENT_REMEDIATION,
} from "@/domains/diagnose/checks/session-environment";
import { sessionEnvironmentSnapshotCases } from "@testing/generators/diagnose/session-environment";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { sessionEnvironmentSnapshotFixture } from "@testing/harnesses/diagnose/worktree-snapshot-consumers";

describe("the session-environment snapshot mapping derives the current worktree occupancy", () => {
  it.each(sessionEnvironmentSnapshotCases())(
    "maps $status occupancy (hook $hookPresent, shell identity $shellIdentity, claim identity $claimCarriesIdentity) to $verdict",
    ({ status, hookPresent, shellIdentity, claimCarriesIdentity, expectedReading, verdict, bucket }) => {
      const snapshot = sessionEnvironmentSnapshotFixture(
        status,
        claimCarriesIdentity ? sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId()) : undefined,
      );

      const reading = sessionEnvironmentReadingFromSnapshot(snapshot, {
        hookPresent,
        sessionIdentity: shellIdentity,
      });
      const record = classifySessionEnvironment(reading);

      expect(reading).toEqual(expectedReading);
      expect(record.verdict).toBe(verdict);
      expect(record.bucket).toBe(bucket);
      expect(record.remediation).toBe(SESSION_ENVIRONMENT_REMEDIATION[verdict]);
    },
  );
});
