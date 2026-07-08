import { describe, it } from "vitest";

import { validationPipelineScenarios } from "@testing/generators/validation/validation";
import { runValidationPipelineScenario } from "@testing/harnesses/validation/pipeline";

describe("validation pipeline composition", () => {
  for (const scenario of validationPipelineScenarios()) {
    it(
      scenario.title,
      { timeout: scenario.timeout },
      async () => {
        await runValidationPipelineScenario(scenario);
      },
    );
  }
});
