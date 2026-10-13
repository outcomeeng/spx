import { describe, expect, it } from "vitest";

import { VALIDATION_COMMAND_OUTPUT, VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import { LINT_SUBPROCESS_TIMEOUT, observeLintSubprocess } from "@testing/harnesses/validation/lint-pipeline";
import { PROJECT_FIXTURES } from "@testing/harnesses/with-validation-env";

describe("lint command line against a product without an ESLint flat config", () => {
  it("exits with a failure and reports the missing config", async () => {
    const result = await observeLintSubprocess(PROJECT_FIXTURES.TYPESCRIPT_NO_ESLINT);

    expect(result.exitCode).not.toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(`${result.stdout}${result.stderr}`).toContain(VALIDATION_COMMAND_OUTPUT.ESLINT_MISSING_CONFIG);
  }, LINT_SUBPROCESS_TIMEOUT);
});
