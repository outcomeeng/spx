import { Option } from "commander";
import { describe, expect, it } from "vitest";

import { allCommand, resolveFullPipelineStages } from "@/commands/validation/all";
import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import {
  createValidationDomain,
  deriveValidationAllOverrideCliOptions,
  validationAllOverrideCliOptions,
} from "@/interfaces/cli/validation";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { VALIDATION_STAGE_PARTICIPATION, type ValidationStageParticipationPolicy } from "@/validation/languages/types";
import {
  composeValidationPipelineStages,
  VALIDATION_REGISTRY_LANGUAGES,
  validationPipelineStages,
  validationRegistry,
} from "@/validation/registry";
import { VALIDATION_CLI_GENERATOR } from "@testing/generators/validation/validation";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";
import { runValidationInProcess } from "@testing/harnesses/validation/cli";
import { invalidOverrideMetadataStageSets } from "@testing/harnesses/validation/pipeline";
import { PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

function registeredParticipationPolicy(): ValidationStageParticipationPolicy {
  return validationPipelineStages[0].participation;
}

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
        expect(stage.participation.override.flag).toMatch(/^--/u);
      }
    }
  });

  it("registers exactly the source-owned registry language descriptors", () => {
    expect(validationRegistry.languages).toEqual(VALIDATION_REGISTRY_LANGUAGES);
  });

  it("resolves the full-pipeline default from the language registry", () => {
    expect(resolveFullPipelineStages(undefined)).toBe(validationPipelineStages);
  });

  it("rejects registry bypass by running a conflicting controlled registry", async () => {
    await withValidationEnv({ fixture: PROJECT_FIXTURES.BARE_PROJECT }, async ({ path }) => {
      await assertProperty(
        VALIDATION_CLI_GENERATOR.conflictingRegistry(),
        async ({ languageName, stageNames }) => {
          const executedStageNames: string[] = [];
          const validationStages = composeValidationPipelineStages([{
            name: languageName,
            stages: stageNames.map((name) => ({
              name,
              failsPipeline: true,
              participation: registeredParticipationPolicy(),
              run: () => {
                executedStageNames.push(name);
                return Promise.resolve({ exitCode: VALIDATION_EXIT_CODES.FAILURE, output: name });
              },
            })),
          }]);

          const result = await allCommand({
            cwd: path,
            quiet: true,
            validationStages,
          });

          expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.FAILURE);
          expect(executedStageNames).toEqual(stageNames);
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    });
  }, propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1));

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
    for (const stages of invalidOverrideMetadataStageSets()) {
      expect(() => deriveValidationAllOverrideCliOptions(stages)).toThrow();
    }
  });

  it("derives validation all override options from registered stage metadata", () => {
    const derivedOptions = deriveValidationAllOverrideCliOptions(validationPipelineStages);

    expect(derivedOptions).toEqual(validationAllOverrideCliOptions);
    expect(derivedOptions).toHaveLength(validationPipelineStages.length);
    for (const stage of validationPipelineStages) {
      const stageOptions = derivedOptions.filter((option) => option.stageName === stage.name);
      const override = stage.participation.override;
      expect(stageOptions).toEqual([{
        stageName: stage.name,
        flag: override.flag,
        description: override.description,
        reason: stage.participation.skipReason,
        optionPropertyName: new Option(override.flag).attributeName(),
      }]);
    }
  });

  it("runs every stage in exactly one of its default and inverse override invocations", async () => {
    for (const registeredStage of validationPipelineStages) {
      let defaultInvocationCount = 0;
      let overrideInvocationCount = 0;
      const stage = (count: () => void) => ({
        ...registeredStage,
        run: async () => {
          count();
          return { exitCode: VALIDATION_EXIT_CODES.SUCCESS, output: registeredStage.name };
        },
      });

      await allCommand({
        cwd: process.cwd(),
        validationStages: [stage(() => defaultInvocationCount += 1)],
        quiet: true,
      });
      await allCommand({
        cwd: process.cwd(),
        validationStages: [stage(() => overrideInvocationCount += 1)],
        participationOverrides: [registeredStage.participation.override.flag],
        quiet: true,
      });

      expect(defaultInvocationCount + overrideInvocationCount).toBe(1);
    }
  });
});
