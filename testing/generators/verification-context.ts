import * as fc from "fast-check";
import { join, win32 } from "node:path";

import type { VerificationContextCreateCliOptions } from "@/commands/verification-context/cli";
import {
  VERIFICATION_CONTEXT_FILE_SUBJECT_PATH,
  VERIFICATION_CONTEXT_PERSISTENCE,
  VERIFICATION_CONTEXT_RUNTIME_ONLY_FIELDS,
  VERIFICATION_CONTEXT_SCHEMA_VERSION,
  VERIFICATION_CONTEXT_SUBJECT_KIND,
  type VerificationContextPayload,
  type VerificationContextPersistence,
  type VerificationContextSubject,
} from "@/domains/verification-context/context";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";

const SAMPLE_SEED = 0x565843;

export interface VerificationContextFileScenario {
  readonly request: VerificationContextCreateCliOptions & {
    readonly subject: typeof VERIFICATION_CONTEXT_SUBJECT_KIND.FILE;
    readonly path: string;
  };
  readonly createdAt: Date;
}

export interface VerificationContextChangesetScenario {
  readonly request: VerificationContextCreateCliOptions & {
    readonly subject: typeof VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET;
    readonly base: string;
    readonly head: string;
  };
  readonly createdAt: Date;
}

export interface VerificationContextPathPropertyScenario {
  readonly productDir: string;
  readonly branchSlug: string;
  readonly payload: VerificationContextPayload;
}

export interface RuntimeContaminatedVerificationContextFileScenario extends VerificationContextFileScenario {
  readonly request: VerificationContextFileScenario["request"] & Record<string, unknown>;
}

export interface VerificationContextDigestPropertyScenario {
  readonly payload: VerificationContextPayload;
  readonly subject: VerificationContextSubject;
  readonly predicate: string;
  readonly workflow: string;
  readonly createdAt: string;
  readonly persistence: VerificationContextPersistence;
}

export type VerificationContextCliScenario =
  | VerificationContextFileScenario
  | VerificationContextChangesetScenario;

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
  persistence: (): fc.Arbitrary<VerificationContextPersistence> =>
    fc.record({
      kind: STATE_STORE_TEST_GENERATOR.scopeToken(),
      scope: STATE_STORE_TEST_GENERATOR.scopeToken(),
      domain: STATE_STORE_TEST_GENERATOR.scopeToken(),
      format: STATE_STORE_TEST_GENERATOR.scopeToken(),
    }),
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
      persistence: fc.oneof(
        fc.constant(VERIFICATION_CONTEXT_PERSISTENCE),
        VERIFICATION_CONTEXT_TEST_GENERATOR.persistence(),
      ),
    }),
  pathPropertyScenario: (): fc.Arbitrary<VerificationContextPathPropertyScenario> =>
    fc.record({
      productDir: STATE_STORE_TEST_GENERATOR.productRoot(),
      branchSlug: STATE_STORE_TEST_GENERATOR.branchSlug(),
      payload: VERIFICATION_CONTEXT_TEST_GENERATOR.payload(),
    }),
  digestPropertyScenario: (): fc.Arbitrary<VerificationContextDigestPropertyScenario> =>
    fc
      .record({
        payload: VERIFICATION_CONTEXT_TEST_GENERATOR.payload(),
        subject: VERIFICATION_CONTEXT_TEST_GENERATOR.subject(),
        predicate: VERIFICATION_CONTEXT_TEST_GENERATOR.predicate(),
        workflow: VERIFICATION_CONTEXT_TEST_GENERATOR.workflow(),
        launchedAt: VERIFICATION_CONTEXT_TEST_GENERATOR.launchedAt(),
        persistence: VERIFICATION_CONTEXT_TEST_GENERATOR.persistence(),
      })
      .filter(({ payload, subject, predicate, workflow, launchedAt, persistence }) =>
        JSON.stringify(payload.subject) !== JSON.stringify(subject)
        && payload.predicate !== predicate
        && payload.workflow.name !== workflow
        && payload.launch.createdAt !== launchedAt.toISOString()
        && JSON.stringify(payload.persistence) !== JSON.stringify(persistence)
      )
      .map(({ launchedAt, ...scenario }) => ({ ...scenario, createdAt: launchedAt.toISOString() })),
} as const;

export function sampleVerificationContextTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { seed: SAMPLE_SEED, numRuns: 1 });
  if (value === undefined) throw new Error("Verification-context test generator returned no sample");
  return value;
}

export function createVerificationContextFileScenario(): VerificationContextFileScenario {
  return {
    request: {
      subject: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE,
      path: sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.filePath()),
      predicate: sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.predicate()),
      workflow: sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.workflow()),
    },
    createdAt: sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.launchedAt()),
  };
}

export function createVerificationContextChangesetScenario(): VerificationContextChangesetScenario {
  return {
    request: {
      subject: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
      base: sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.changesetRef()),
      head: sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.changesetRef()),
      predicate: sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.predicate()),
      workflow: sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.workflow()),
    },
    createdAt: sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.launchedAt()),
  };
}

export function createWindowsVerificationContextFileScenario(): VerificationContextFileScenario {
  const scenario = createVerificationContextFileScenario();
  return {
    ...scenario,
    request: {
      ...scenario.request,
      path: scenario.request.path.replaceAll(
        VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.CANONICAL,
        VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.WINDOWS,
      ),
    },
  };
}

export function createRuntimeContaminatedVerificationContextFileScenario(): RuntimeContaminatedVerificationContextFileScenario {
  const scenario = createVerificationContextFileScenario();
  return {
    ...scenario,
    request: {
      ...scenario.request,
      [VERIFICATION_CONTEXT_RUNTIME_ONLY_FIELDS.STATUS]: sampleVerificationContextTestValue(
        VERIFICATION_CONTEXT_TEST_GENERATOR.predicate(),
      ),
      [VERIFICATION_CONTEXT_RUNTIME_ONLY_FIELDS.VERDICT]: sampleVerificationContextTestValue(
        VERIFICATION_CONTEXT_TEST_GENERATOR.predicate(),
      ),
      [VERIFICATION_CONTEXT_RUNTIME_ONLY_FIELDS.COST]: sampleVerificationContextTestValue(
        STATE_STORE_TEST_GENERATOR.scopeToken(),
      ),
      [VERIFICATION_CONTEXT_RUNTIME_ONLY_FIELDS.ACTIVITY_TRACE]: sampleVerificationContextTestValue(
        VERIFICATION_CONTEXT_TEST_GENERATOR.workflow(),
      ),
    },
  };
}

export function createDivergentVerificationContextContent(): string {
  return sampleVerificationContextTestValue(VERIFICATION_CONTEXT_TEST_GENERATOR.predicate());
}

export function unsafeVerificationContextFileSubjectPaths(
  productDir: string,
  path: string,
): readonly string[] {
  const parentSegments = Array.from(
    { length: path.split(VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.CANONICAL).length + 1 },
    () => VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.PARENT_DIRECTORY.SEGMENT,
  );
  return [
    productDir,
    win32.resolve(productDir, path),
    VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.PARENT_DIRECTORY.SEGMENT,
    join(VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.PARENT_DIRECTORY.SEGMENT, path),
    win32.join(VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.PARENT_DIRECTORY.SEGMENT, path),
    `C:${VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.PARENT_DIRECTORY.PREFIX}${path}`,
    join(path, ...parentSegments, path),
  ];
}
