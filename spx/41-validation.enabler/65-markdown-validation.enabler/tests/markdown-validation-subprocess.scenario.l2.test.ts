import { describe, it } from "vitest";

import { markdownE2eScenarios } from "@testing/generators/validation/markdown";
import { runMarkdownValidationScenario } from "@testing/harnesses/validation/markdown";

describe("markdown validation e2e evidence", () => {
  for (const scenario of markdownE2eScenarios()) {
    it(
      scenario.title,
      { timeout: scenario.timeout },
      async () => {
        await runMarkdownValidationScenario(scenario);
      },
    );
  }
});
