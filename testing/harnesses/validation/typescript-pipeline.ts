import { validationAllTypeScriptSubprocessScenarios } from "@testing/generators/validation/validation";
import { expectValidationSubprocessResult, runValidationSubprocess } from "@testing/harnesses/validation/cli";
import { collectHarnessTestCases, describe, it } from "@testing/harnesses/vitest-registration";
import { type FixtureName, PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

function registerTypeScriptPipelineTests(fixture?: FixtureName): void {
  describe("TypeScript validation pipeline subprocess", () => {
    for (
      const scenario of validationAllTypeScriptSubprocessScenarios().filter(
        (candidate) => fixture === undefined || candidate.fixture === fixture,
      )
    ) {
      it(
        scenario.title,
        async () => {
          await withValidationEnv({ fixture: scenario.fixture }, async ({ path }) => {
            const result = await runValidationSubprocess(scenario.args, {
              cwd: path,
              timeout: scenario.timeout,
            });

            expectValidationSubprocessResult(result, scenario);
          });
        },
        scenario.timeout,
      );
    }
  });
}

export const typescriptValidationScenarioCases = collectHarnessTestCases(() => {
  registerTypeScriptPipelineTests();
});

export const typescriptValidationComplianceCases = collectHarnessTestCases(() => {
  registerTypeScriptPipelineTests(PROJECT_FIXTURES.PYTHON_PROJECT);
});
