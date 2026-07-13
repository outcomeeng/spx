import { resolveFullPipelineStages } from "@/commands/validation/all";
import { createValidationDomain } from "@/interfaces/cli/validation";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { formattingValidationLanguage } from "@/validation/languages/formatting";
import { markdownValidationLanguage } from "@/validation/languages/markdown";
import { VALIDATION_STAGE_PARTICIPATION } from "@/validation/languages/types";
import { typescriptValidationLanguage } from "@/validation/languages/typescript";
import { validationPipelineStages, validationRegistry } from "@/validation/registry";
import { runValidationInProcess } from "@testing/harnesses/validation/cli";
import {
  expectValidationAllOverrideMetadataRejectsUnsupportedFlags,
  expectValidationAllOverrideOptionsDerived,
} from "@testing/harnesses/validation/pipeline";
import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";
import { PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

export const validationRegistryComplianceCases = collectHarnessTestCases(() => {
  describe("validation language registry composition", () => {
    it("exposes language descriptors with at least one named, callable stage each", () => {
      expect(validationRegistry.languages.length).toBeGreaterThan(0);
      for (const language of validationRegistry.languages) {
        expect(language.name.length).toBeGreaterThan(0);
        expect(language.stages.length).toBeGreaterThan(0);
        for (const stage of language.stages) {
          expect(stage.name.length).toBeGreaterThan(0);
          expect(stage.run).toBeInstanceOf(Function);
          expect(Object.values(VALIDATION_STAGE_PARTICIPATION)).toContain(stage.participation.default);
        }
      }
    });

    it("registers exactly the explicitly imported typescript, markdown, and formatting language descriptors", () => {
      expect(validationRegistry.languages).toEqual([
        typescriptValidationLanguage,
        markdownValidationLanguage,
        formattingValidationLanguage,
      ]);
    });

    it("resolves the full-pipeline default from the language registry", () => {
      expect(resolveFullPipelineStages(undefined)).toBe(validationPipelineStages);
    });

    it("dispatches every registry stage through the validation-all command surface", async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
        const result = await runValidationInProcess(
          [validationCliDefinition.subcommands.all.commandName],
          { domain: createValidationDomain(), processCwd: () => path },
        );

        for (const stage of validationPipelineStages) {
          expect(result.stdout).toContain(stage.name);
        }
      });
    });

    it("total stage count is derived from the registry rather than a hardcoded pipeline constant", () => {
      const totalStagesFromRegistry = validationRegistry.languages.flatMap((language) => language.stages).length;
      // Independent oracle from the spec mapping in validation.md — TypeScript
      // contributes 5 stages (circular deps, unused code, lint, type check,
      // literal reuse), markdown contributes 1, and formatting contributes 1.
      // Deliberately NOT derived from the descriptors: deriving the expected count
      // from the registry would make this assertion a tautology that no stage-count
      // regression could fail.
      const expectedFromSpecMapping = 5 + 1 + 1;
      expect(totalStagesFromRegistry).toBe(expectedFromSpecMapping);
    });

    it("derives validation all override flags from stage participation metadata", () => {
      expectValidationAllOverrideOptionsDerived();
    });

    it("rejects unsupported validation all override metadata shapes", () => {
      expectValidationAllOverrideMetadataRejectsUnsupportedFlags();
    });
  });
});
