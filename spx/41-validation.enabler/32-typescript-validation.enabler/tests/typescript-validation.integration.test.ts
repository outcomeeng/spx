import { describe, it } from "vitest";

import { validationAllTypeScriptSubprocessScenarios } from "@testing/generators/validation/validation";
import { expectValidationSubprocessResult, runValidationSubprocess } from "@testing/harnesses/validation/cli";
import { withValidationEnv } from "@testing/harnesses/with-validation-env";

describe("TypeScript validation pipeline subprocess", () => {
  for (const scenario of validationAllTypeScriptSubprocessScenarios()) {
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
