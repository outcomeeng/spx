import { describe, expect, it } from "vitest";

import { HOOK_ERROR } from "@/interfaces/hooks/registry";
import { withSessionStartCliAcceptanceEvidence } from "@testing/harnesses/hooks/session-start";

describe("hook CLI compliance", () => {
  it("ALWAYS: hook run accepts session-start as the first required event operand", async () => {
    await withSessionStartCliAcceptanceEvidence((evidence) => {
      expect(evidence.acceptedResult.exitCode, evidence.acceptedResult.stderr).toBe(0);
      expect(evidence.rejectedResult.exitCode).not.toBe(0);
      expect(evidence.rejectedResult.stderr).toContain(HOOK_ERROR.UNKNOWN_EVENT);
    });
  });
});
