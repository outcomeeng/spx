import { validationLintSubprocessScenarios } from "@testing/generators/validation/validation";
import {
  expectValidationSubprocessResult,
  runValidationSubprocess,
  validationSubprocessHarnessOptions,
} from "@testing/harnesses/validation/cli";
import { collectHarnessTestCases, describe, it } from "@testing/harnesses/vitest-registration";
import { type FixtureName, PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

function registerLintPipelineTests(excludedFixture?: FixtureName): void {
  describe("lint validation subprocess", () => {
    for (const scenario of validationLintSubprocessScenarios()) {
      const options = validationSubprocessHarnessOptions(scenario);
      if (options.fixture === excludedFixture) continue;
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

export const lintPipelineScenarioCases = collectHarnessTestCases(() => {
  registerLintPipelineTests();
});

export const lintPipelineComplianceCases = collectHarnessTestCases(() => {
  registerLintPipelineTests(PROJECT_FIXTURES.CLEAN_PROJECT);
});
