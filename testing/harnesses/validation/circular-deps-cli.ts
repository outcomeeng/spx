import { expect, it } from "vitest";

import { VALIDATION_COMMAND_OUTPUT, VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import { runValidationSubprocess } from "@testing/harnesses/validation/cli";
import { HARNESS_TIMEOUT, PROJECT_FIXTURES, withValidationEnv } from "@testing/harnesses/with-validation-env";

async function expectPackagedCliRoutesCircularValidation(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.CLEAN_PROJECT }, async ({ path }) => {
    const result = await runValidationSubprocess(
      [validationCliDefinition.subcommands.circular.commandName],
      { cwd: path },
    );

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND);
    expect(result.stdout).not.toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_FOUND);
  });
}

async function expectPackagedCliReportsCircularDependencies(): Promise<void> {
  await withValidationEnv({ fixture: PROJECT_FIXTURES.WITH_CIRCULAR_DEPS }, async ({ path }) => {
    const result = await runValidationSubprocess(
      [validationCliDefinition.subcommands.circular.commandName],
      { cwd: path },
    );

    expect(result.exitCode).not.toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(result.stderr).toContain(VALIDATION_COMMAND_OUTPUT.CIRCULAR_FOUND);
    expect(result.stderr).toContain(VALIDATION_PIPELINE_DATA.circularOutput.DETAIL_A_TO_B);
  });
}

export function registerCircularDepsScenarioL2Tests(): void {
  it(
    "packaged CLI routes validation circular to dependency-cruiser",
    { timeout: HARNESS_TIMEOUT },
    expectPackagedCliRoutesCircularValidation,
  );
  it(
    "packaged CLI reports real circular dependencies",
    { timeout: HARNESS_TIMEOUT },
    expectPackagedCliReportsCircularDependencies,
  );
}
