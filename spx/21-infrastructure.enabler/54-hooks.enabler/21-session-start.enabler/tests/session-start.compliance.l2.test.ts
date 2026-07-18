import { describe, expect, it } from "vitest";

import { withSessionStartCliAcceptanceEvidence } from "@testing/harnesses/hooks/session-start";

describe("hook CLI compliance", () => {
  it("ALWAYS: hook run accepts session-start as the first required event operand", async () => {
    await withSessionStartCliAcceptanceEvidence((evidence) => {
      expect(evidence.result.exitCode, evidence.result.stderr).toBe(0);
    });
  });
});
