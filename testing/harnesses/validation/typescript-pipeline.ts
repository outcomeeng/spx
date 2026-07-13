import { allCommand } from "@/commands/validation/all";
import { formatTypeScriptAbsentSkipMessage, formatValidationStageSkipOutput } from "@/commands/validation/messages";
import { VALIDATION_STAGE_PARTICIPATION, type ValidationStage } from "@/validation/languages/types";
import { typescriptValidationLanguage } from "@/validation/languages/typescript";
import { validationAllTypeScriptSubprocessScenarios } from "@testing/generators/validation/validation";
import {
  expectValidationSubprocessResult,
  runValidationSubprocess,
  validationSubprocessHarnessOptions,
} from "@testing/harnesses/validation/cli";
import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";
import { type FixtureName, PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

function registerTypeScriptPipelineTests(fixture?: FixtureName): void {
  describe("TypeScript validation pipeline subprocess", () => {
    for (const scenario of validationAllTypeScriptSubprocessScenarios()) {
      const options = validationSubprocessHarnessOptions(scenario);
      if (fixture !== undefined && options.fixture !== fixture) continue;
      it(
        scenario.title,
        async () => {
          await withValidationEnv({ fixture: options.fixture }, async ({ path }) => {
            const result = await runValidationSubprocess(scenario.args, {
              cwd: path,
              timeout: options.timeout,
            });

            expectValidationSubprocessResult(result, scenario);
            for (const stage of typescriptValidationLanguage.stages) {
              expect(result.stdout).toContain(
                options.fixture === PROJECT_FIXTURES.PYTHON_PROJECT
                  ? formatTypeScriptAbsentSkipMessage(stage.name)
                  : stage.name,
              );
            }
          });
        },
        options.timeout,
      );
    }
  });
}

export const typescriptValidationScenarioCases = collectHarnessTestCases(() => {
  registerTypeScriptPipelineTests(PROJECT_FIXTURES.CLEAN_PROJECT);
});

export const typescriptValidationComplianceCases = collectHarnessTestCases(() => {
  registerTypeScriptPipelineTests(PROJECT_FIXTURES.PYTHON_PROJECT);
  registerTypeScriptPipelineTests(PROJECT_FIXTURES.WITH_TYPE_ERRORS);

  describe("TypeScript descriptor participation compliance", () => {
    for (const registeredStage of typescriptValidationLanguage.stages) {
      it(`${registeredStage.name} follows a descriptor default changed to skip`, async () => {
        const stage: ValidationStage = {
          ...registeredStage,
          participation: {
            default: VALIDATION_STAGE_PARTICIPATION.SKIP,
            defaultSkipReason: registeredStage.name,
          },
          run: async () => {
            throw new Error(`${registeredStage.name} ran despite its descriptor default`);
          },
        };

        const result = await allCommand({ cwd: process.cwd(), validationStages: [stage] });

        expect(result.exitCode).toBe(0);
        expect(result.output).toContain(formatValidationStageSkipOutput(registeredStage.name, registeredStage.name));
      });
    }
  });
});
