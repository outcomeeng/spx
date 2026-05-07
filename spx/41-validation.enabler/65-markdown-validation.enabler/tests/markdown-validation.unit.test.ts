import { describe, it } from "vitest";

import { markdownUnitScenarios } from "@testing/generators/validation/markdown";
import { runMarkdownValidationScenario } from "@testing/harnesses/validation/markdown";

describe("markdown validation unit evidence", () => {
  for (const scenario of markdownUnitScenarios()) {
    it(
      scenario.title,
      { timeout: scenario.timeout },
      async () => {
        await runMarkdownValidationScenario(scenario);
      },
    );
  }
});
