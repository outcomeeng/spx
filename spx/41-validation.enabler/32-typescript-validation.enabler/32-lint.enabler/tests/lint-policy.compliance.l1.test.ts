import { describe, it } from "vitest";

import { validationLintPolicyScenarios } from "@testing/generators/validation/lint-policy";
import { runValidationLintPolicyScenario } from "@testing/harnesses/validation/lint-policy";

describe("lint policy validation", () => {
  for (const scenario of validationLintPolicyScenarios()) {
    it(scenario.title, async () => {
      await runValidationLintPolicyScenario(scenario);
    });
  }
});
