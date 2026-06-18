import * as fc from "fast-check";

import {
  AUDIT_PROGRESS_STEP,
  AUDIT_RUN_STATE_STATUS,
  type AuditRunState,
  type AuditRunStateStatus,
  auditRunFileName,
  formatAuditRunTimestamp,
  slugAuditBranchIdentity,
} from "@/domains/audit/run-state";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";

const HEAD_SHA_PATTERN = /^[a-f0-9]{40}$/;
const RUN_ID_PATTERN = /^[a-f0-9]{12}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const PUNCTUATION_BRANCH_SEPARATOR = "/";
const PUNCTUATION_BRANCH_MARK = "!";
const EMPTY_NORMALIZED_BRANCH = "!!!";
const MAX_AUDIT_RUN_DURATION_MS = 86_400_000;
const OVERLONG_BRANCH_SEGMENT_COUNT = 24;

export const AUDIT_RUN_STATE_TEST_GENERATOR = {
  auditRunState: arbitraryAuditRunState,
  branchName: arbitraryBranchName,
  branchNameSegment: CONFIG_TEST_GENERATOR.key,
  branchSlug: arbitraryBranchSlug,
  branchNameWithPunctuation: arbitraryBranchNameWithPunctuation,
  digest: arbitraryDigest,
  emptyNormalizedBranchName: arbitraryEmptyNormalizedBranchName,
  headSha: arbitraryHeadSha,
  missingRunFileName: arbitraryRunFileName,
  overlongBranchName: arbitraryOverlongBranchName,
  runId: arbitraryRunId,
  runFileName: arbitraryRunFileName,
  status: arbitraryStatus,
  timestampDate: arbitraryTimestampDate,
  unknownProgressStep: arbitraryUnknownProgressStep,
  unknownProgressStepCohort: arbitraryUnknownProgressStepCohort,
} as const;

export function sampleAuditRunStateTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  return sampleConfigTestValue(arbitrary);
}

function arbitraryBranchName(): fc.Arbitrary<string> {
  return fc
    .tuple(CONFIG_TEST_GENERATOR.key(), CONFIG_TEST_GENERATOR.key())
    .map(([first, second]) => `${first}${PUNCTUATION_BRANCH_SEPARATOR}${second}`);
}

function arbitraryBranchNameWithPunctuation(): fc.Arbitrary<string> {
  return fc
    .tuple(CONFIG_TEST_GENERATOR.key(), CONFIG_TEST_GENERATOR.key())
    .map(([first, second]) =>
      `${first.toUpperCase()}${PUNCTUATION_BRANCH_SEPARATOR}${PUNCTUATION_BRANCH_MARK}${second}`
    );
}

function arbitraryBranchSlug(): fc.Arbitrary<string> {
  return arbitraryBranchName().map(slugAuditBranchIdentity);
}

function arbitraryEmptyNormalizedBranchName(): fc.Arbitrary<string> {
  return fc.constant(EMPTY_NORMALIZED_BRANCH);
}

function arbitraryOverlongBranchName(): fc.Arbitrary<string> {
  return fc
    .array(CONFIG_TEST_GENERATOR.key(), { minLength: OVERLONG_BRANCH_SEGMENT_COUNT, maxLength: OVERLONG_BRANCH_SEGMENT_COUNT })
    .map((segments) => segments.join(PUNCTUATION_BRANCH_SEPARATOR));
}

function arbitraryHeadSha(): fc.Arbitrary<string> {
  return fc.stringMatching(HEAD_SHA_PATTERN);
}

function arbitraryRunId(): fc.Arbitrary<string> {
  return fc.stringMatching(RUN_ID_PATTERN);
}

function arbitraryRunFileName(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitraryTimestampDate(), arbitraryRunId())
    .map(([date, runId]) => auditRunFileName(`${formatAuditRunTimestamp(date)}-${runId}`));
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

function arbitraryStatus(): fc.Arbitrary<AuditRunStateStatus> {
  return fc.constantFrom(...Object.values(AUDIT_RUN_STATE_STATUS));
}

function arbitraryUnknownProgressStep(): fc.Arbitrary<string> {
  return fc.oneof(
    CONFIG_TEST_GENERATOR.key(),
    CONFIG_TEST_GENERATOR.key().map((key) => `${key}${PUNCTUATION_BRANCH_MARK}`),
    CONFIG_TEST_GENERATOR.key().map((key) => `${PUNCTUATION_BRANCH_MARK}${key}`),
    arbitraryBranchNameWithPunctuation(),
    fc.constantFrom(...Object.values(AUDIT_PROGRESS_STEP)).map((step) => `${step}${PUNCTUATION_BRANCH_MARK}`),
    fc.constantFrom(...Object.values(AUDIT_PROGRESS_STEP)).map((step) => `${PUNCTUATION_BRANCH_MARK}${step}`),
  );
}

function arbitraryUnknownProgressStepCohort(): fc.Arbitrary<readonly string[]> {
  return fc.tuple(
    CONFIG_TEST_GENERATOR.key(),
    CONFIG_TEST_GENERATOR.key().map((key) => `${key}${PUNCTUATION_BRANCH_MARK}`),
    CONFIG_TEST_GENERATOR.key().map((key) => `${PUNCTUATION_BRANCH_MARK}${key}`),
    arbitraryBranchNameWithPunctuation(),
    fc.constantFrom(...Object.values(AUDIT_PROGRESS_STEP)).map((step) => `${step}${PUNCTUATION_BRANCH_MARK}`),
    fc.constantFrom(...Object.values(AUDIT_PROGRESS_STEP)).map((step) => `${PUNCTUATION_BRANCH_MARK}${step}`),
  );
}

function arbitraryAuditRunState(): fc.Arbitrary<AuditRunState> {
  return fc
    .record({
      branchName: arbitraryBranchName(),
      headSha: arbitraryHeadSha(),
      baseRef: CONFIG_TEST_GENERATOR.key(),
      auditConfigDigest: arbitraryDigest(),
      auditors: fc.array(CONFIG_TEST_GENERATOR.key(), { minLength: 0, maxLength: 4 }),
      targets: fc.array(CONFIG_TEST_GENERATOR.key(), { minLength: 0, maxLength: 4 }),
      startedDate: arbitraryTimestampDate(),
      durationMs: fc.nat({ max: MAX_AUDIT_RUN_DURATION_MS }),
      status: arbitraryStatus(),
      verdictPath: fc.option(CONFIG_TEST_GENERATOR.key(), { nil: undefined }),
    })
    .map(
      (
        {
          branchName,
          headSha,
          baseRef,
          auditConfigDigest,
          auditors,
          targets,
          startedDate,
          durationMs,
          status,
          verdictPath,
        },
      ) => {
        const branchSlug = slugAuditBranchIdentity(branchName);
        const startedAt = formatAuditRunTimestamp(startedDate);
        const completedDate = new Date(startedDate.getTime() + durationMs);
        const completedAt = formatAuditRunTimestamp(completedDate);
        return {
          branchName,
          branchSlug,
          headSha,
          baseRef,
          auditConfigDigest,
          auditors,
          targets,
          startedAt,
          completedAt,
          ...(verdictPath === undefined ? {} : { verdictPath }),
          status,
        };
      },
    );
}
