import { describe, expect, it } from "vitest";

import {
  formatValidationNoProblemsMessage,
  formatValidationProblemsFoundMessage,
  VALIDATION_PROBLEM_TERMS,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "@/commands/validation/messages";

describe("ALWAYS: validation uses problem as its canonical attention-item term", () => {
  for (const stageName of Object.values(VALIDATION_STAGE_DISPLAY_NAMES)) {
    it(`${stageName} uses the canonical plural term when no problems exist`, () => {
      expect(formatValidationNoProblemsMessage(stageName)).toContain(VALIDATION_PROBLEM_TERMS.PLURAL);
    });

    it(`${stageName} uses the canonical singular term for one problem`, () => {
      expect(formatValidationProblemsFoundMessage(stageName, { count: 1 })).toContain(
        VALIDATION_PROBLEM_TERMS.SINGULAR,
      );
    });

    it(`${stageName} uses the canonical plural term for multiple problems`, () => {
      expect(formatValidationProblemsFoundMessage(stageName, { count: 2 })).toContain(
        VALIDATION_PROBLEM_TERMS.PLURAL,
      );
    });
  }
});
