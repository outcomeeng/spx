import * as fc from "fast-check";

import { allCommand, resolveFullPipelineStages } from "@/commands/validation/all";
import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import {
  createValidationDomain,
  deriveValidationAllOverrideCliOptions,
  validationAllOverrideCliOptions,
  validationOptionPropertyName,
} from "@/interfaces/cli/validation";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { formattingValidationLanguage } from "@/validation/languages/formatting";
import { markdownValidationLanguage } from "@/validation/languages/markdown";
import { VALIDATION_STAGE_PARTICIPATION } from "@/validation/languages/types";
import { typescriptValidationLanguage } from "@/validation/languages/typescript";
import {
  VALIDATION_STAGE_PARTICIPATION_POLICIES,
  validationPipelineStages,
  validationRegistry,
} from "@/validation/registry";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { runValidationInProcess } from "@testing/harnesses/validation/cli";
import { expectValidationAllOverrideMetadataRejectsUnsupportedFlags } from "@testing/harnesses/validation/pipeline";
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

    it("runs the exact ordered stage collection supplied through the full-pipeline command input", async () => {
      await withValidationEnv({ fixture: PROJECT_FIXTURES.BARE_PROJECT }, async ({ path }) => {
        await assertProperty(
          fc.uniqueArray(
            arbitraryDomainLiteral().filter(
              (candidate) => !validationPipelineStages.some((stage) => stage.name === candidate),
            ),
            { minLength: 1, maxLength: validationPipelineStages.length },
          ),
          async (stageNames) => {
            const executedStageNames: string[] = [];
            const validationStages = stageNames.map((name) => ({
              name,
              failsPipeline: true,
              participation: { default: VALIDATION_STAGE_PARTICIPATION.RUN },
              run: () => {
                executedStageNames.push(name);
                return Promise.resolve({ exitCode: VALIDATION_EXIT_CODES.SUCCESS, output: name });
              },
            }));

            const result = await allCommand({
              cwd: path,
              quiet: true,
              validationStages,
            });

            expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
            expect(executedStageNames).toEqual(stageNames);
          },
          { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
        );
      });
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

    it("rejects unsupported validation all override metadata shapes", () => {
      expectValidationAllOverrideMetadataRejectsUnsupportedFlags();
    });

    it("derives validation all override options from registered stage metadata", () => {
      const derivedOptions = deriveValidationAllOverrideCliOptions(validationPipelineStages);

      expect(derivedOptions).toEqual(validationAllOverrideCliOptions);
      for (const stage of validationPipelineStages) {
        const stageOptions = derivedOptions.filter((option) => option.stageName === stage.name);
        const override = stage.participation.override;
        if (override === undefined) {
          expect(stageOptions).toEqual([]);
          continue;
        }
        expect(stageOptions).toEqual([{
          stageName: stage.name,
          flag: override.flag,
          description: override.description,
          reason: override.reason,
          optionPropertyName: validationOptionPropertyName(override.flag),
        }]);
      }
    });

    it("binds every descriptor stage to its independently declared participation policy", () => {
      expect(
        Object.fromEntries(validationPipelineStages.map((stage) => [stage.name, stage.participation])),
      ).toEqual(VALIDATION_STAGE_PARTICIPATION_POLICIES);
    });
  });
});
