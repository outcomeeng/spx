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
        let executionCount = 0;
        const stage: ValidationStage = {
          ...registeredStage,
          participation: {
            ...registeredStage.participation,
            default: VALIDATION_STAGE_PARTICIPATION.SKIP,
            skipReason: registeredStage.name,
          },
          run: async () => {
            executionCount += 1;
            return { exitCode: 0, output: registeredStage.name };
          },
        };

        const defaultResult = await allCommand({ cwd: process.cwd(), validationStages: [stage] });
        const overrideResult = await allCommand({
          cwd: process.cwd(),
          validationStages: [stage],
          participationOverrides: [stage.participation.override.flag],
        });

        expect(defaultResult.exitCode).toBe(0);
        expect(defaultResult.output).toContain(
          formatValidationStageSkipOutput(registeredStage.name, registeredStage.name),
        );
        expect(overrideResult.exitCode).toBe(0);
        expect(overrideResult.output).not.toContain(
          formatValidationStageSkipOutput(registeredStage.name, registeredStage.name),
        );
        expect(executionCount).toBe(1);
      });
    }
  });
});
