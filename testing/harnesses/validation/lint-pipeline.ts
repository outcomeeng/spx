import { validationCliDefinition } from "@/interfaces/cli/validation-contract";
import { runValidationSubprocess, type ValidationCliResult } from "@testing/harnesses/validation/cli";
import { type FixtureName, HARNESS_TIMEOUT, withValidationEnv } from "@testing/harnesses/with-validation-env";

/** The timeout, in milliseconds, a lint subprocess case allows. */
export const LINT_SUBPROCESS_TIMEOUT = HARNESS_TIMEOUT;

/** Runs `spx validation lint` as a subprocess inside a copy of the named fixture product and returns its observed result. */
export async function observeLintSubprocess(fixture: FixtureName): Promise<ValidationCliResult> {
  let observed: ValidationCliResult | undefined;
  await withValidationEnv({ fixture }, async ({ path }) => {
    observed = await runValidationSubprocess([validationCliDefinition.subcommands.lint.commandName], {
      cwd: path,
      timeout: LINT_SUBPROCESS_TIMEOUT,
    });
  });
  if (observed === undefined) throw new Error("The lint subprocess produced no result");
  return observed;
}
