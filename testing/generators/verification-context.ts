import * as fc from "fast-check";

import {
  VERIFICATION_CONTEXT_PERSISTENCE,
  VERIFICATION_CONTEXT_SCHEMA_VERSION,
  VERIFICATION_CONTEXT_SUBJECT_KIND,
  type VerificationContextPayload,
  type VerificationContextSubject,
} from "@/domains/verification-context/context";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";

const SAMPLE_SEED = 0x565843;

export const VERIFICATION_CONTEXT_TEST_GENERATOR = {
  predicate: (): fc.Arbitrary<string> => STATE_STORE_TEST_GENERATOR.scopeToken(),
  workflow: (): fc.Arbitrary<string> => STATE_STORE_TEST_GENERATOR.scopeToken(),
  filePath: (): fc.Arbitrary<string> => arbitrarySourceFilePath(),
  changesetRef: (): fc.Arbitrary<string> => STATE_STORE_TEST_GENERATOR.scopeToken(),
  launchedAt: (): fc.Arbitrary<Date> =>
    fc.date({
      min: new Date("2026-01-01T00:00:00.000Z"),
      max: new Date("2026-12-31T23:59:59.999Z"),
      noInvalidDate: true,
    }),
  fileSubject: (): fc.Arbitrary<VerificationContextSubject> =>
    arbitrarySourceFilePath().map((path) => ({ kind: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE, path })),
  changesetSubject: (): fc.Arbitrary<VerificationContextSubject> =>
    fc
      .tuple(STATE_STORE_TEST_GENERATOR.scopeToken(), STATE_STORE_TEST_GENERATOR.scopeToken())
      .map(([base, head]) => ({ kind: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET, base, head })),
  subject: (): fc.Arbitrary<VerificationContextSubject> =>
    fc.oneof(
      VERIFICATION_CONTEXT_TEST_GENERATOR.fileSubject(),
      VERIFICATION_CONTEXT_TEST_GENERATOR.changesetSubject(),
    ),
  payload: (): fc.Arbitrary<VerificationContextPayload> =>
    fc.record({
      schemaVersion: fc.constant(VERIFICATION_CONTEXT_SCHEMA_VERSION),
      subject: VERIFICATION_CONTEXT_TEST_GENERATOR.subject(),
      predicate: VERIFICATION_CONTEXT_TEST_GENERATOR.predicate(),
      workflow: fc.record({ name: VERIFICATION_CONTEXT_TEST_GENERATOR.workflow() }),
      launch: fc.record({
        productDir: STATE_STORE_TEST_GENERATOR.productRoot(),
        branchSlug: STATE_STORE_TEST_GENERATOR.branchSlug(),
        branchIdentity: STATE_STORE_TEST_GENERATOR.branchIdentity(),
        headSha: STATE_STORE_TEST_GENERATOR.headSha(),
        createdAt: VERIFICATION_CONTEXT_TEST_GENERATOR.launchedAt().map((date) => date.toISOString()),
      }),
      persistence: fc.constant(VERIFICATION_CONTEXT_PERSISTENCE),
    }),
} as const;

export function sampleVerificationContextTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { seed: SAMPLE_SEED, numRuns: 1 });
  if (value === undefined) throw new Error("Verification-context test generator returned no sample");
  return value;
}
