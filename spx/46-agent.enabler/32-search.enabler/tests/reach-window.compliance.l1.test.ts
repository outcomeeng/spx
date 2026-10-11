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
        const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
        const prefix = literal(AGENT_CLI_ERROR_PREFIX);
        const hint = attempt.expectedDiagnostic === AGENT_SINCE_DIAGNOSTIC.MISSING_UNIT
          ? literal(AGENT_SINCE_ACCEPTED_FORM)
          : "";
        const singleDiagnostic = new RegExp(
          String.raw`^(?:(?!.*${prefix}).*\n)*${prefix}(?!.*${prefix})(?=.*${literal(attempt.sanitizedDuration)})`
            + String.raw`(?=.*${literal(attempt.expectedDiagnostic)})(?=.*${hint}).*(?:\n(?!.*${prefix}).*)*$`,
        );
        expect(attempt.stderr).toMatch(singleDiagnostic);
      }
    });
  });
});
