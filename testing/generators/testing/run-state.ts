import * as fc from "fast-check";

import {
  formatTestRunTimestamp,
  type ProductInputDigest,
  slugTestingBranchIdentity,
  type StalenessInputs,
  TEST_RUN_STATE_FIELDS,
  TEST_RUN_STATE_STATUS,
  type TestContentEntry,
  type TestRunnerOutcome,
  type TestRunState,
  type TestRunStateStatus,
} from "@/testing/run-state";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { arbitraryDomainLiteral, arbitrarySpecTreeTestFilePath } from "@testing/generators/literal/literal";

type MutableStalenessDigestField =
  | typeof TEST_RUN_STATE_FIELDS.TESTING_CONFIG_DIGEST
  | typeof TEST_RUN_STATE_FIELDS.DISCOVERED_TEST_PATHS_DIGEST
  | typeof TEST_RUN_STATE_FIELDS.DISCOVERED_TEST_CONTENT_DIGEST;

const HEAD_SHA_PATTERN = /^[a-f0-9]{40}$/;
const RUN_ID_PATTERN = /^[a-f0-9]{12}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const BRANCH_SEPARATOR = "/";
const MAX_RUN_DURATION_MS = 86_400_000;
const MAX_EXIT_CODE = 255;
const MAX_RUNNER_OUTCOMES = 4;
const MAX_PRODUCT_INPUT_DIGESTS = 4;
const MIN_TEST_PATHS = 1;
const MAX_TEST_PATHS = 6;
const MIN_CONTENT_ENTRIES = 1;
const MAX_CONTENT_ENTRIES = 6;

export const TEST_RUN_STATE_TEST_GENERATOR = {
  testRunState: arbitraryTestRunState,
  stalenessInputs: arbitraryStalenessInputs,
  branchName: arbitraryBranchName,
  branchSlug: arbitraryBranchSlug,
  headSha: arbitraryHeadSha,
  digest: arbitraryDigest,
  runId: arbitraryRunId,
  runDirectoryName: arbitraryRunDirectoryName,
  status: arbitraryStatus,
  timestampDate: arbitraryTimestampDate,
  runnerOutcome: arbitraryRunnerOutcome,
  productInputDigest: arbitraryProductInputDigest,
  testPaths: arbitraryTestPaths,
  testContentEntries: arbitraryTestContentEntries,
  mutableStalenessDigestField: arbitraryMutableStalenessDigestField,
} as const;

function arbitraryMutableStalenessDigestField(): fc.Arbitrary<MutableStalenessDigestField> {
  return fc.constantFrom(
    TEST_RUN_STATE_FIELDS.TESTING_CONFIG_DIGEST,
    TEST_RUN_STATE_FIELDS.DISCOVERED_TEST_PATHS_DIGEST,
    TEST_RUN_STATE_FIELDS.DISCOVERED_TEST_CONTENT_DIGEST,
  );
}

export function sampleTestRunStateValue<T>(arbitrary: fc.Arbitrary<T>): T {
  return sampleConfigTestValue(arbitrary);
}

function arbitraryBranchName(): fc.Arbitrary<string> {
  return fc
    .tuple(CONFIG_TEST_GENERATOR.key(), CONFIG_TEST_GENERATOR.key())
    .map(([first, second]) => `${first}${BRANCH_SEPARATOR}${second}`);
}

function arbitraryBranchSlug(): fc.Arbitrary<string> {
  return arbitraryBranchName().map((name) => slugTestingBranchIdentity(name));
}

function arbitraryHeadSha(): fc.Arbitrary<string> {
  return fc.stringMatching(HEAD_SHA_PATTERN);
}

function arbitraryRunId(): fc.Arbitrary<string> {
  return fc.stringMatching(RUN_ID_PATTERN);
}

function arbitraryDigest(): fc.Arbitrary<string> {
  return fc.stringMatching(DIGEST_PATTERN);
}

function arbitraryTimestampDate(): fc.Arbitrary<Date> {
  return fc.date({
    min: new Date(Date.UTC(2024, 0, 1)),
    max: new Date(Date.UTC(2026, 11, 31)),
    noInvalidDate: true,
  });
}

function arbitraryRunDirectoryName(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitraryTimestampDate(), arbitraryRunId())
    .map(([date, runId]) => `${formatTestRunTimestamp(date)}-${runId}`);
}

function arbitraryStatus(): fc.Arbitrary<TestRunStateStatus> {
  return fc.constantFrom(...Object.values(TEST_RUN_STATE_STATUS));
}

function arbitraryTestPaths(): fc.Arbitrary<readonly string[]> {
  return fc.uniqueArray(arbitrarySpecTreeTestFilePath(), {
    minLength: MIN_TEST_PATHS,
    maxLength: MAX_TEST_PATHS,
  });
}

function arbitraryRunnerOutcome(): fc.Arbitrary<TestRunnerOutcome> {
  return fc.record({
    runnerId: CONFIG_TEST_GENERATOR.key(),
    testPaths: arbitraryTestPaths(),
    exitCode: fc.nat({ max: MAX_EXIT_CODE }),
  });
}

function arbitraryProductInputDigest(): fc.Arbitrary<ProductInputDigest> {
  return fc.record({
    descriptorId: CONFIG_TEST_GENERATOR.key(),
    digest: arbitraryDigest(),
  });
}

function arbitraryTestContentEntries(): fc.Arbitrary<readonly TestContentEntry[]> {
  return fc
    .tuple(
      fc.uniqueArray(arbitrarySpecTreeTestFilePath(), {
        minLength: MIN_CONTENT_ENTRIES,
        maxLength: MAX_CONTENT_ENTRIES,
      }),
      fc.array(arbitraryDomainLiteral(), {
        minLength: MIN_CONTENT_ENTRIES,
        maxLength: MAX_CONTENT_ENTRIES,
      }),
    )
    .map(([paths, contents]) => paths.map((path, index) => ({ path, content: contents[index % contents.length] })));
}

function arbitraryStalenessInputs(): fc.Arbitrary<StalenessInputs> {
  return fc.record({
    testingConfigDigest: arbitraryDigest(),
    discoveredTestPathsDigest: arbitraryDigest(),
    discoveredTestContentDigest: arbitraryDigest(),
    productInputDigests: fc.array(arbitraryProductInputDigest(), {
      minLength: 0,
      maxLength: MAX_PRODUCT_INPUT_DIGESTS,
    }),
  });
}

function arbitraryTestRunState(): fc.Arbitrary<TestRunState> {
  return fc
    .record({
      branchName: arbitraryBranchName(),
      headSha: arbitraryHeadSha(),
      testingConfigDigest: arbitraryDigest(),
      runnerOutcomes: fc.array(arbitraryRunnerOutcome(), { minLength: 0, maxLength: MAX_RUNNER_OUTCOMES }),
      discoveredTestPathsDigest: arbitraryDigest(),
      discoveredTestContentDigest: arbitraryDigest(),
      productInputDigests: fc.array(arbitraryProductInputDigest(), {
        minLength: 0,
        maxLength: MAX_PRODUCT_INPUT_DIGESTS,
      }),
      startedDate: arbitraryTimestampDate(),
      durationMs: fc.nat({ max: MAX_RUN_DURATION_MS }),
      status: arbitraryStatus(),
    })
    .map(
      (
        {
          branchName,
          headSha,
          testingConfigDigest,
          runnerOutcomes,
          discoveredTestPathsDigest,
          discoveredTestContentDigest,
          productInputDigests,
          startedDate,
          durationMs,
          status,
        },
      ) => {
        const branchSlug = slugTestingBranchIdentity(branchName);
        const startedAt = formatTestRunTimestamp(startedDate);
        const completedAt = formatTestRunTimestamp(new Date(startedDate.getTime() + durationMs));
        return {
          branchName,
          branchSlug,
          headSha,
          testingConfigDigest,
          runnerOutcomes,
          discoveredTestPathsDigest,
          discoveredTestContentDigest,
          productInputDigests,
          startedAt,
          completedAt,
          status,
        };
      },
    );
}
