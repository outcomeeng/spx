import { describe, it } from "vitest";

import { markdownIntegrationScenarios } from "@testing/generators/validation/markdown";
import { runMarkdownValidationScenario } from "@testing/harnesses/validation/markdown";

describe("markdown validation integration evidence", () => {
  for (const scenario of markdownIntegrationScenarios()) {
    it(
      scenario.title,
      { timeout: scenario.timeout },
      async () => {
        await runMarkdownValidationScenario(scenario);
      },
    );
  }
});
