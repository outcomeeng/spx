import { describe, it } from "vitest";

import { validationStructuralMappingScenarios } from "@testing/generators/validation/validation";
import { expectValidationStructuralMapping } from "@testing/harnesses/validation/pipeline";

describe("validation subtree structural mappings", () => {
  for (const scenario of validationStructuralMappingScenarios()) {
    it(scenario.title, () => {
      expectValidationStructuralMapping(scenario);
    });
  }
});
