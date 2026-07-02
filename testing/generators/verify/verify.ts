import * as fc from "fast-check";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { REVIEW_FINDING_DISPOSITION, type ReviewFinding, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";

const VERIFY_VERIFICATION_TYPES: readonly string[] = Object.values(VERIFY_VERIFICATION_TYPE);
import { GIT_MODIFY_STATUS_EXAMPLE, GIT_NULL_RECORD_SEPARATOR } from "@/lib/git/name-status";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";

const REVIEW_FINDING_DISPOSITIONS = Object.values(REVIEW_FINDING_DISPOSITION);
const TERMINAL_STATUSES: readonly string[] = Object.values(JOURNAL_RUN_STATE_STATUS);
const EMPTY_SUMMARY = "";

/** A string outside the valid review-finding disposition set — an invalid `disposition` value. */
function arbitraryNonDisposition(): fc.Arbitrary<string> {
  return fc.string().filter((value) => !(REVIEW_FINDING_DISPOSITIONS as readonly string[]).includes(value));
}

/** A valid review finding: a known disposition and a non-empty summary. */
function arbitraryReviewFinding(): fc.Arbitrary<ReviewFinding> {
  return fc.record({
    disposition: fc.constantFrom(...REVIEW_FINDING_DISPOSITIONS),
    summary: STATE_STORE_TEST_GENERATOR.scopeToken(),
  });
}

const SAMPLE_SEED = 0x5645524659;
const CHANGED_PATH_MIN = 1;
const CHANGED_PATH_MAX = 5;
const FINDING_BATCH_MIN = 1;
const FINDING_BATCH_MAX = 4;
const BLANK_CHARACTERS = [" ", "\t", "\n", "\r"] as const;
const BLANK_ARGUMENT_MAX = 4;

/** A review finding paired with the caller idempotency key that appends it. */
export interface FindingWithKey {
  readonly finding: ReviewFinding;
  readonly idempotencyKey: string;
}

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
  idempotencyKey: (): fc.Arbitrary<string> => STATE_STORE_TEST_GENERATOR.scopeToken(),
  idempotencyKeyPair: (): fc.Arbitrary<{ readonly first: string; readonly second: string }> =>
    fc
      .tuple(STATE_STORE_TEST_GENERATOR.scopeToken(), STATE_STORE_TEST_GENERATOR.scopeToken())
      .filter(([first, second]) => first !== second)
      .map(([first, second]) => ({ first, second })),
  blankIdempotencyKey: (): fc.Arbitrary<string> => arbitraryBlankArgument(),
  blankPayloadSource: (): fc.Arbitrary<string> => arbitraryBlankArgument(),
  reviewFinding: (): fc.Arbitrary<ReviewFinding> => arbitraryReviewFinding(),
  terminalStatus: (): fc.Arbitrary<string> => fc.constantFrom(...TERMINAL_STATUSES),
  distinctTerminalStatuses: (): fc.Arbitrary<{ readonly first: string; readonly second: string }> =>
    fc
      .tuple(fc.constantFrom(...TERMINAL_STATUSES), fc.constantFrom(...TERMINAL_STATUSES))
      .filter(([first, second]) => first !== second)
      .map(([first, second]) => ({ first, second })),
  invalidTerminalStatus: (): fc.Arbitrary<string> =>
    STATE_STORE_TEST_GENERATOR.scopeToken().filter((value) => !TERMINAL_STATUSES.includes(value)),
  blankTerminalStatus: (): fc.Arbitrary<string> => arbitraryBlankArgument(),
  reviewFindingBatch: (): fc.Arbitrary<readonly FindingWithKey[]> =>
    fc.uniqueArray(
      fc.record({ finding: arbitraryReviewFinding(), idempotencyKey: STATE_STORE_TEST_GENERATOR.scopeToken() }),
      { selector: (entry) => entry.idempotencyKey, minLength: FINDING_BATCH_MIN, maxLength: FINDING_BATCH_MAX },
    ),
  invalidReviewFinding: (): fc.Arbitrary<unknown> =>
    fc.oneof(
      fc.constant(null),
      fc.integer(),
      fc.array(STATE_STORE_TEST_GENERATOR.scopeToken()),
      fc.record({ disposition: arbitraryNonDisposition(), summary: STATE_STORE_TEST_GENERATOR.scopeToken() }),
      fc.record({ summary: STATE_STORE_TEST_GENERATOR.scopeToken() }),
      fc.record({ disposition: fc.constantFrom(...REVIEW_FINDING_DISPOSITIONS), summary: fc.constant(EMPTY_SUMMARY) }),
      fc.record({ disposition: fc.constantFrom(...REVIEW_FINDING_DISPOSITIONS) }),
    ),
  scopePayload: (): fc.Arbitrary<Record<string, string>> =>
    fc.dictionary(STATE_STORE_TEST_GENERATOR.scopeToken(), STATE_STORE_TEST_GENERATOR.scopeToken(), {
      minKeys: 1,
      maxKeys: 4,
    }),
  unsupportedVerificationType: (): fc.Arbitrary<string> =>
    STATE_STORE_TEST_GENERATOR.scopeToken().filter((value) => !VERIFY_VERIFICATION_TYPES.includes(value)),
} as const;

export function sampleVerifyTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { seed: SAMPLE_SEED, numRuns: 1 });
  if (value === undefined) throw new Error("Verify test generator returned no sample");
  return value;
}
