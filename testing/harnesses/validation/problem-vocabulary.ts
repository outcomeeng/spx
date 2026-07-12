import { describe, expect, it } from "vitest";

import { VALIDATION_PROBLEM_TERMS, VALIDATION_STAGE_PROBLEM_MESSAGES } from "@/commands/validation/messages";

describe("ALWAYS: validation uses problem as its canonical attention-item term", () => {
  for (const [stageName, messages] of Object.entries(VALIDATION_STAGE_PROBLEM_MESSAGES)) {
    it(`${stageName} clear output uses the canonical plural term`, () => {
      expect(messages.clear).toContain(VALIDATION_PROBLEM_TERMS.PLURAL);
    });

    it(`${stageName} attention output uses the canonical problem term`, () => {
      expect(messages.attention).toContain(VALIDATION_PROBLEM_TERMS.PLURAL);
    });
  }
});
