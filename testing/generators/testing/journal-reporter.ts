import * as fc from "fast-check";

import { TEST_PAYLOAD_FIELD } from "@/domains/verify/verify";
import type { JsonValue } from "@/lib/agent-run-journal";
import {
  JOURNAL_RUN_TERMINAL_STATUS,
  type JournalRunTerminalStatus,
  type TestFinding,
  type TestScopeUnit,
} from "@/test/languages/types";
import { CONFIG_TEST_GENERATOR } from "@testing/generators/config/descriptors";
import {
  arbitraryDomainLiteral,
  arbitraryTestFilePath,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";

/** The scope a journal-streaming run covers: a product directory and the test paths to run. */
export interface GeneratedRunRequest {
  readonly productDir: string;
  readonly testPaths: readonly string[];
}

/** Generated test-case outcomes: the reporter's input vocabulary, owned here independently of the reporter source. */
export const GENERATED_CASE_STATE = {
  PASSED: "passed",
  FAILED: "failed",
} as const;

/** Outcome of a generated test case: passing carries no errors, failing carries at least one. */
export type GeneratedCaseState = (typeof GENERATED_CASE_STATE)[keyof typeof GENERATED_CASE_STATE];

/** A generated Vitest case outcome the reporter translates into evidence. */
export interface GeneratedRunCase {
  readonly testName: string;
  readonly state: GeneratedCaseState;
  readonly errors: readonly string[];
}

/** A generated Vitest module run: a module id and the case outcomes resolved within it. */
export interface GeneratedRunScenario {
  readonly moduleId: string;
  readonly cases: readonly GeneratedRunCase[];
}

const MIN_CASES = 1;
const MAX_CASES = 5;
const MIN_ERRORS = 1;
const MAX_ERRORS = 3;
const MAX_EXTRA_CASES = 3;
const MAX_SCOPE_UNITS = 4;
const MAX_FINDINGS = 4;
const MAX_TEST_PATHS = 3;

function arbitraryScopeUnit(): fc.Arbitrary<TestScopeUnit> {
  return fc.record({ moduleId: arbitraryTestFilePath() });
}

/** The message the reporter records for a Vitest error carrying no message: the `error.message ?? ""` fallback. */
const ABSENT_ERROR_MESSAGE = "";

/** A message the reporter records for a failing case, spanning ordinary text and the message-absent empty-string fallback. */
function arbitraryFindingErrorMessage(): fc.Arbitrary<string> {
  return fc.oneof(fc.constant(ABSENT_ERROR_MESSAGE), arbitraryDomainLiteral());
}

/**
 * A finding spanning the test finding schema's full valid domain: the errors array may be empty when
 * a failing case carries no message, and each message may be the empty-string fallback, so a
 * conformance check exercises the may-be-empty boundary the schema declares.
 */
function arbitraryFinding(): fc.Arbitrary<TestFinding> {
  return fc.record({
    moduleId: arbitraryTestFilePath(),
    testName: arbitraryDomainLiteral(),
    errors: fc.array(arbitraryFindingErrorMessage(), { maxLength: MAX_ERRORS }),
  });
}

/**
 * A finding whose error messages are the reporter's message-absent fallback. A failing case whose
 * Vitest errors carry no message resolves each to an empty string, so consumers must accept empty
 * message strings.
 */
function arbitraryFindingWithoutErrorMessages(): fc.Arbitrary<TestFinding> {
  return fc.record({
    moduleId: arbitraryTestFilePath(),
    testName: arbitraryDomainLiteral(),
    errors: fc.array(fc.constant(ABSENT_ERROR_MESSAGE), { minLength: MIN_ERRORS, maxLength: MAX_ERRORS }),
  });
}

/** Test scope payloads the recorder must reject: non-records and a scope missing its module id. */
function arbitraryInvalidScopeUnit(): fc.Arbitrary<unknown> {
  return fc.oneof(
    fc.constant(null),
    fc.integer(),
    fc.array(arbitraryTestFilePath()),
    arbitraryScopeUnit().map(({ moduleId: _moduleId, ...rest }) => rest),
  );
}

/** Test finding payloads the recorder must reject: non-records, missing identity, and non-string-array errors. */
function arbitraryInvalidFinding(): fc.Arbitrary<unknown> {
  return fc.oneof(
    fc.constant(null),
    fc.integer(),
    arbitraryFinding().map(({ moduleId: _moduleId, ...rest }) => rest),
    arbitraryFinding().map(({ testName: _testName, ...rest }) => rest),
    arbitraryFinding().map((finding) => ({ ...finding, errors: undefined })),
    arbitraryFinding().chain((finding) =>
      fc.array(fc.integer(), { minLength: MIN_ERRORS }).map((errors) => ({ ...finding, errors }))
    ),
  );
}

function arbitraryScopeUnits(): fc.Arbitrary<readonly TestScopeUnit[]> {
  return fc.array(arbitraryScopeUnit(), { maxLength: MAX_SCOPE_UNITS });
}

function arbitraryFindings(): fc.Arbitrary<readonly TestFinding[]> {
  return fc.array(arbitraryFinding(), { maxLength: MAX_FINDINGS });
}

function arbitraryTerminalStatus(): fc.Arbitrary<JournalRunTerminalStatus> {
  return fc.constantFrom(...Object.values(JOURNAL_RUN_TERMINAL_STATUS));
}

function arbitraryRunRequest(): fc.Arbitrary<GeneratedRunRequest> {
  return fc.record({
    productDir: CONFIG_TEST_GENERATOR.productDir(),
    testPaths: fc.array(arbitraryTestFilePath(), { maxLength: MAX_TEST_PATHS }),
  });
}

function arbitraryPassingCase(): fc.Arbitrary<GeneratedRunCase> {
  return fc.record({
    testName: arbitraryDomainLiteral(),
    state: fc.constant(GENERATED_CASE_STATE.PASSED),
    errors: fc.constant<readonly string[]>([]),
  });
}

function arbitraryFailingCase(): fc.Arbitrary<GeneratedRunCase> {
  return fc.record({
    testName: arbitraryDomainLiteral(),
    state: fc.constant(GENERATED_CASE_STATE.FAILED),
    errors: fc.array(arbitraryDomainLiteral(), { minLength: MIN_ERRORS, maxLength: MAX_ERRORS }),
  });
}

function arbitraryRunCase(): fc.Arbitrary<GeneratedRunCase> {
  return fc.oneof(arbitraryPassingCase(), arbitraryFailingCase());
}

function arbitraryRunScenario(): fc.Arbitrary<GeneratedRunScenario> {
  return fc.record({
    moduleId: arbitraryTestFilePath(),
    cases: fc.array(arbitraryRunCase(), { minLength: MIN_CASES, maxLength: MAX_CASES }),
  });
}

/** A scenario guaranteed to hold at least one passing case and one failing case. */
function arbitraryMixedRunScenario(): fc.Arbitrary<GeneratedRunScenario> {
  return fc
    .tuple(
      arbitraryTestFilePath(),
      arbitraryPassingCase(),
      arbitraryFailingCase(),
      fc.array(arbitraryRunCase(), { maxLength: MAX_EXTRA_CASES }),
    )
    .map(([moduleId, passing, failing, extra]) => ({
      moduleId,
      cases: [passing, failing, ...extra],
    }));
}

/** The separator a naive `moduleId + separator + testName` finding key would join on; a collision-safe key must encode the pair without straddling it. */
const NAIVE_FINDING_KEY_SEPARATOR = "::";

/**
 * Two distinct findings whose module id and test name straddle the naive separator differently, so a
 * `moduleId + separator + testName` join collapses them onto one key while the pair stays genuinely
 * distinct. The related values must agree — the two module-id/test-name splits share the same middle
 * segment — so the pair is one coherent scenario rather than independent draws.
 */
function arbitraryCollidingFindingPair(): fc.Arbitrary<readonly [TestFinding, TestFinding]> {
  return fc
    .tuple(arbitraryDomainLiteral(), arbitraryDomainLiteral(), arbitraryDomainLiteral())
    .map(([left, middle, right]) => [
      { moduleId: `${left}${NAIVE_FINDING_KEY_SEPARATOR}${middle}`, testName: right, errors: [] },
      { moduleId: left, testName: `${middle}${NAIVE_FINDING_KEY_SEPARATOR}${right}`, errors: [] },
    ]);
}

/** The required fields of the `test` scope schema, drawn from the production vocabulary. */
const REQUIRED_TEST_SCOPE_FIELDS = [TEST_PAYLOAD_FIELD.MODULE_ID] as const;

/** The required fields of the `test` finding schema. */
const REQUIRED_TEST_FINDING_FIELDS = [
  TEST_PAYLOAD_FIELD.MODULE_ID,
  TEST_PAYLOAD_FIELD.TEST_NAME,
  TEST_PAYLOAD_FIELD.ERRORS,
] as const;

/** One otherwise-valid `test` payload with a single named required field removed. */
export interface TestMissingFieldScenario {
  readonly payload: JsonValue;
  readonly missingField: string;
}

function testPayloadWithoutField(payload: unknown, field: string): JsonValue {
  const { [field]: _removed, ...rest } = JSON.parse(JSON.stringify(payload)) as { readonly [key: string]: JsonValue };
  return rest;
}

function arbitraryScopeUnitMissingRequiredField(): fc.Arbitrary<TestMissingFieldScenario> {
  return fc
    .tuple(arbitraryScopeUnit(), fc.constantFrom(...REQUIRED_TEST_SCOPE_FIELDS))
    .map(([unit, missingField]) => ({ payload: testPayloadWithoutField(unit, missingField), missingField }));
}

function arbitraryFindingMissingRequiredField(): fc.Arbitrary<TestMissingFieldScenario> {
  return fc
    .tuple(arbitraryFinding(), fc.constantFrom(...REQUIRED_TEST_FINDING_FIELDS))
    .map(([finding, missingField]) => ({ payload: testPayloadWithoutField(finding, missingField), missingField }));
}

export const JOURNAL_REPORTER_TEST_GENERATOR = {
  runScenario: arbitraryRunScenario,
  mixedRunScenario: arbitraryMixedRunScenario,
  runCase: arbitraryRunCase,
  passingCase: arbitraryPassingCase,
  failingCase: arbitraryFailingCase,
  scopeUnit: arbitraryScopeUnit,
  scopeUnits: arbitraryScopeUnits,
  invalidScopeUnit: arbitraryInvalidScopeUnit,
  finding: arbitraryFinding,
  findingWithoutErrorMessages: arbitraryFindingWithoutErrorMessages,
  collidingFindingPair: arbitraryCollidingFindingPair,
  invalidFinding: arbitraryInvalidFinding,
  findings: arbitraryFindings,
  terminalStatus: arbitraryTerminalStatus,
  runRequest: arbitraryRunRequest,
  scopeUnitMissingRequiredField: arbitraryScopeUnitMissingRequiredField,
  findingMissingRequiredField: arbitraryFindingMissingRequiredField,
} as const;

export function sampleJournalReporterValue<T>(arbitrary: fc.Arbitrary<T>): T {
  return sampleLiteralTestValue(arbitrary);
}
