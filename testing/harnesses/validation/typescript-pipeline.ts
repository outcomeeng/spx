import { allCommand } from "@/commands/validation/all";
import { formatValidationNoProblemsMessage } from "@/commands/validation/messages";
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
          });
        },
        options.timeout,
      );
    }
  });
}

export const typescriptValidationScenarioCases = collectHarnessTestCases(() => {
  registerTypeScriptPipelineTests();
});

export const typescriptValidationComplianceCases = collectHarnessTestCases(() => {
  registerTypeScriptPipelineTests(PROJECT_FIXTURES.PYTHON_PROJECT);

  describe("TypeScript descriptor participation compliance", () => {
    it("runs every TypeScript stage whose descriptor defaults to run", async () => {
      const observedStageNames: string[] = [];
      const stages = typescriptValidationLanguage.stages.map((stage): ValidationStage => ({
        ...stage,
        run: async () => {
          observedStageNames.push(stage.name);
          return { exitCode: 0, output: formatValidationNoProblemsMessage(stage.name) };
        },
      }));

      const result = await allCommand({ cwd: process.cwd(), quiet: true, validationStages: stages });

      expect(result.exitCode).toBe(0);
      expect(observedStageNames).toEqual(stages.map((stage) => stage.name));
    });

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
        expect(result.output).toContain(registeredStage.name);
      });
    }
  });
});
