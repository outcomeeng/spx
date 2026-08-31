import { describe, expect, it } from "vitest";

import { withAgentSearchRejectedSinceEvidence } from "@testing/harnesses/agent/search";

describe("agent search — reach window rejection", () => {
  it("rejects every invalid since duration before writing a result", async () => {
    await withAgentSearchRejectedSinceEvidence((evidence) => {
      expect(evidence.attempts.length).toBeGreaterThan(0);
      for (const attempt of evidence.attempts) {
        expect(attempt.error).toBeInstanceOf(Error);
        expect(attempt.stdout).toHaveLength(0);
        expect(attempt.stderr).toContain(attempt.sanitizedDuration);
      }
    });
  });
});
