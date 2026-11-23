import * as fc from "fast-check";

const VALIDATION_SUBPROCESS_TEXT_UNITS = "abcdefghijklmnopqrstuvwxyz".split("");
const VALIDATION_SUBPROCESS_TEXT_MAX_LENGTH = 32;

/** Exit code 0, the code a successfully closing validation child reports. */
export const VALIDATION_SUBPROCESS_EXPECTED_SUCCESS_EXIT_CODE = 0;

/** One spawn call a validation step makes: its command, its arguments, and the working directory of its options. */
export interface ValidationSpawnCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

/** A text of 1 to 32 lowercase letters, which a test writes to a stream of a validation child. */
export function arbitraryValidationSubprocessText(): fc.Arbitrary<string> {
  return fc.string({
    unit: fc.constantFrom(...VALIDATION_SUBPROCESS_TEXT_UNITS),
    minLength: 1,
    maxLength: VALIDATION_SUBPROCESS_TEXT_MAX_LENGTH,
  });
}

/** One text drawn from {@link arbitraryValidationSubprocessText}, for a scenario. */
export function sampleValidationSubprocessText(): string {
  const [text] = fc.sample(arbitraryValidationSubprocessText(), { numRuns: 1 });
  return text;
}

/** A spawn call with any command string, any list of argument strings, and any working-directory string. */
export function arbitraryValidationSpawnCall(): fc.Arbitrary<ValidationSpawnCall> {
  return fc.record({
    command: fc.string(),
    args: fc.array(fc.string()),
    cwd: fc.string(),
  });
}

/** A sequence of spawn calls, the empty sequence included. */
export function arbitraryValidationSpawnCallSequence(): fc.Arbitrary<ValidationSpawnCall[]> {
  return fc.array(arbitraryValidationSpawnCall());
}
