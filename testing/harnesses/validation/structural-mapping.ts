import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";

import {
  TYPESCRIPT_VALIDATION_STAGE_BY_CONCERN,
  type TypeScriptValidationConcern,
  typescriptValidationLanguage,
} from "@/validation/languages/typescript";
import { validationPipelineStages, validationRegistry } from "@/validation/registry";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { collectHarnessTestCases, describe, it } from "@testing/harnesses/vitest-registration";

function expectValidationStructuralMapping(concern: TypeScriptValidationConcern, stageName: string): void {
  expect(validationRegistry.languages).toContain(typescriptValidationLanguage);
  expect(typescriptValidationLanguage.concerns).toContain(concern);
  expect(typescriptValidationLanguage.stageByConcern[concern]).toBe(stageName);
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
  expect(typescriptValidationLanguage.stages.some((stage) => stage.name === stageName)).toBe(true);
  expect(validationPipelineStages.some((stage) => stage.name === stageName)).toBe(true);
}

export const validationStructuralMappingCases = collectHarnessTestCases(() => {
  describe("validation subtree structural mappings", () => {
    for (const [concern, stageName] of Object.entries(TYPESCRIPT_VALIDATION_STAGE_BY_CONCERN)) {
      it(`${concern} maps to ${stageName}`, () => {
        expectValidationStructuralMapping(concern as TypeScriptValidationConcern, stageName);
      });
    }
  });
});
