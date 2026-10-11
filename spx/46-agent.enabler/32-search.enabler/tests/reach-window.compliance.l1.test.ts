import { describe, expect, it } from "vitest";

import { AGENT_CLI_EXIT } from "@/interfaces/cli/agent";

import { withAgentSearchRejectedSinceEvidence } from "@testing/harnesses/agent/search";

import { sinceRejectionViolations } from "@testing/generators/agent/since-rejection";

describe("agent search — reach window rejection", () => {
  it("rejects a unitless, invalid, zero, negative, non-finite, or unsafe since duration with one diagnostic naming its condition before writing a result", async () => {
    await withAgentSearchRejectedSinceEvidence((evidence) => {
      expect(evidence.attempts.length).toBeGreaterThan(0);
      for (const attempt of evidence.attempts) {
        expect(attempt.error).toBeInstanceOf(Error);
        expect(attempt.exitCode).toBe(AGENT_CLI_EXIT.FAILURE);
        expect(attempt.stdout).toHaveLength(0);
        expect(sinceRejectionViolations(attempt)).toEqual([]);
      }
    });
  });
});
