import { describe, expect, it } from "vitest";

import {
  AGENT_CLI_ERROR_PREFIX,
  AGENT_CLI_EXIT,
  AGENT_SINCE_ACCEPTED_FORM,
  AGENT_SINCE_DIAGNOSTIC,
} from "@/interfaces/cli/agent";

import { withAgentSearchRejectedSinceEvidence } from "@testing/harnesses/agent/search";

describe("agent search — reach window rejection", () => {
  it("rejects a unitless, invalid, zero, negative, non-finite, or unsafe since duration with one diagnostic naming its condition before writing a result", async () => {
    await withAgentSearchRejectedSinceEvidence((evidence) => {
      expect(evidence.attempts.length).toBeGreaterThan(0);
      for (const attempt of evidence.attempts) {
        expect(attempt.error).toBeInstanceOf(Error);
        expect(attempt.exitCode).toBe(AGENT_CLI_EXIT.FAILURE);
        expect(attempt.stdout).toHaveLength(0);
        const diagnosticLines = attempt.stderr.split("\n").filter((line) => line.includes(AGENT_CLI_ERROR_PREFIX));
        expect(diagnosticLines).toHaveLength(1);
        const [diagnosticLine] = diagnosticLines;
        expect(diagnosticLine.startsWith(AGENT_CLI_ERROR_PREFIX)).toBe(true);
        expect(diagnosticLine.slice(AGENT_CLI_ERROR_PREFIX.length)).not.toContain(AGENT_CLI_ERROR_PREFIX);
        expect(diagnosticLine).toContain(attempt.sanitizedDuration);
        expect(diagnosticLine).toContain(attempt.expectedDiagnostic);
        if (attempt.expectedDiagnostic === AGENT_SINCE_DIAGNOSTIC.MISSING_UNIT) {
          expect(diagnosticLine).toContain(AGENT_SINCE_ACCEPTED_FORM);
        }
      }
    });
  });
});
