import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";

import { TYPESCRIPT_VALIDATION_CONCERN, typescriptValidationLanguage } from "@/validation/languages/typescript";
import { validationPipelineStages, validationRegistry } from "@/validation/registry";
import {
  VALIDATION_PIPELINE_DATA,
  validationStructuralMappingScenarios,
} from "@testing/generators/validation/validation";
import { collectHarnessTestCases, describe, it } from "@testing/harnesses/vitest-registration";

function expectValidationStructuralMapping(): void {
  expect(validationRegistry.languages).toContain(typescriptValidationLanguage);
  expect(typescriptValidationLanguage.concerns).toEqual([
    TYPESCRIPT_VALIDATION_CONCERN.LINT,
    TYPESCRIPT_VALIDATION_CONCERN.TYPE_CHECK,
    TYPESCRIPT_VALIDATION_CONCERN.AST_ENFORCEMENT,
    TYPESCRIPT_VALIDATION_CONCERN.CIRCULAR_DEPS,
    TYPESCRIPT_VALIDATION_CONCERN.LITERAL_REUSE,
    TYPESCRIPT_VALIDATION_CONCERN.UNUSED_CODE,
  ]);
  for (const concern of typescriptValidationLanguage.concerns) {
    expect(
      existsSync(
        join(
          process.cwd(),
          ...VALIDATION_PIPELINE_DATA.typescriptValidationNodeSegments,
          `32-${concern}.enabler`,
          `${concern}.md`,
        ),
      ),
    ).toBe(true);
  }
  for (const stage of typescriptValidationLanguage.stages) {
    expect(validationPipelineStages).toContain(stage);
  }
}

export const validationStructuralMappingCases = collectHarnessTestCases(() => {
  describe("validation subtree structural mappings", () => {
    for (const scenario of validationStructuralMappingScenarios()) {
      it(scenario.title, () => {
        expectValidationStructuralMapping();
      });
    }
  });
});
