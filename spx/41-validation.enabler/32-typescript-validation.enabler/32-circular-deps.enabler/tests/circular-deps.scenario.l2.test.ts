import { describe, it } from "vitest";

import { validationCircularSubprocessScenarios } from "@testing/generators/validation/validation";
import { expectValidationSubprocessResult, runValidationSubprocess } from "@testing/harnesses/validation/cli";
import { withValidationEnv } from "@testing/harnesses/with-validation-env";

describe("circular dependency validation subprocess", () => {
  for (const scenario of validationCircularSubprocessScenarios()) {
    it(
      scenario.title,
      { timeout: scenario.timeout },
      async () => {
        await withValidationEnv({ fixture: scenario.fixture }, async ({ path }) => {
          const result = await runValidationSubprocess(scenario.args, {
            cwd: path,
            timeout: scenario.timeout,
          });

          expectValidationSubprocessResult(result, scenario);
        });
      },
    );
  }
});
