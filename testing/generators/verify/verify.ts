import * as fc from "fast-check";

import { GIT_MODIFY_STATUS_EXAMPLE, GIT_NULL_RECORD_SEPARATOR } from "@/lib/git/name-status";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";

const SAMPLE_SEED = 0x5645524659;
const CHANGED_PATH_MIN = 1;
const CHANGED_PATH_MAX = 5;
const BLANK_CHARACTERS = [" ", "\t", "\n", "\r"] as const;
const BLANK_ARGUMENT_MAX = 4;

/**
 * The blank-argument domain: whitespace-only and empty strings a caller supplies when no real
 * `--input` source or `--run` token was given. The verify command trims and rejects these, so
 * the boundary tests explore the blank domain rather than asserting one hand-picked empty value.
 */
function arbitraryBlankArgument(): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...BLANK_CHARACTERS), { minLength: 0, maxLength: BLANK_ARGUMENT_MAX })
    .map((characters) => characters.join(""));
}

/**
 * Build the `git diff --name-status -z <base>..<head>` stdout a changeset diff produces
 * for a set of modified paths, so a test can inject a realistic git response through the
 * git dependency and assert the changed-file scope the command derives from it. The status
 * marker and record separator are the source-owned git protocol constants of
 * `@/lib/git/name-status`; the paths are the generated domain the test explores.
 */
export function formatNameStatusZ(paths: readonly string[]): string {
  return paths.flatMap((path) => [GIT_MODIFY_STATUS_EXAMPLE, path]).join(GIT_NULL_RECORD_SEPARATOR);
}

export const VERIFY_TEST_GENERATOR = {
  verificationType: (): fc.Arbitrary<string> => STATE_STORE_TEST_GENERATOR.scopeToken(),
  changesetRef: (): fc.Arbitrary<string> => STATE_STORE_TEST_GENERATOR.scopeToken(),
  changesetRange: (): fc.Arbitrary<{ readonly base: string; readonly head: string }> =>
    fc
      .tuple(STATE_STORE_TEST_GENERATOR.scopeToken(), STATE_STORE_TEST_GENERATOR.scopeToken())
      .filter(([base, head]) => base !== head)
      .map(([base, head]) => ({ base, head })),
  runToken: (): fc.Arbitrary<string> => STATE_STORE_TEST_GENERATOR.runToken(),
  blankInputSource: (): fc.Arbitrary<string> => arbitraryBlankArgument(),
  blankRunToken: (): fc.Arbitrary<string> => arbitraryBlankArgument(),
  launchedAt: (): fc.Arbitrary<Date> =>
    fc.date({
      min: new Date("2026-01-01T00:00:00.000Z"),
      max: new Date("2026-12-31T23:59:59.999Z"),
      noInvalidDate: true,
    }),
  inputPayload: (): fc.Arbitrary<Record<string, string>> =>
    fc.dictionary(STATE_STORE_TEST_GENERATOR.scopeToken(), STATE_STORE_TEST_GENERATOR.scopeToken(), {
      minKeys: 1,
      maxKeys: 4,
    }),
  changedPaths: (): fc.Arbitrary<readonly string[]> =>
    fc.uniqueArray(arbitrarySourceFilePath(), { minLength: CHANGED_PATH_MIN, maxLength: CHANGED_PATH_MAX }),
  changedPathsPair: (): fc.Arbitrary<{ readonly first: readonly string[]; readonly second: readonly string[] }> =>
    fc
      .tuple(
        fc.uniqueArray(arbitrarySourceFilePath(), { minLength: CHANGED_PATH_MIN, maxLength: CHANGED_PATH_MAX }),
        fc.uniqueArray(arbitrarySourceFilePath(), { minLength: CHANGED_PATH_MIN, maxLength: CHANGED_PATH_MAX }),
      )
      .filter(([first, second]) =>
        [...first].sort((a, b) => a.localeCompare(b)).join() !== [...second].sort((a, b) => a.localeCompare(b)).join()
      )
      .map(([first, second]) => ({ first, second })),
} as const;

export function sampleVerifyTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { seed: SAMPLE_SEED, numRuns: 1 });
  if (value === undefined) throw new Error("Verify test generator returned no sample");
  return value;
}
