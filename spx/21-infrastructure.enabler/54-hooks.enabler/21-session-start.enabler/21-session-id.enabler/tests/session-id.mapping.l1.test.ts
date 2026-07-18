import { describe, expect, it } from "vitest";

import { PI_SESSION_START_REJECTION_CASES } from "@testing/harnesses/hooks/session-start";

describe("hook session-start Pi identity rejection mapping", () => {
  it.each(PI_SESSION_START_REJECTION_CASES)(
    "maps $rejection.diagnostic to no identity or claim",
    async (testCase) => {
      await testCase.runHook((evidence) => {
        expect(evidence.result.ok).toBe(true);
        if (!evidence.result.ok) throw new Error(evidence.result.error);
        expect(evidence.result.value.sessionId).toBeUndefined();
        expect(evidence.result.value.claimed).toBe(false);
        expect(evidence.result.value.diagnostics).toContainEqual(
          expect.stringContaining(testCase.rejection.diagnostic),
        );
      });
    },
  );
});
