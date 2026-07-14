import * as fc from "fast-check";

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

function arbitraryFinding(): fc.Arbitrary<TestFinding> {
  return fc.record({
    moduleId: arbitraryTestFilePath(),
    testName: arbitraryDomainLiteral(),
    errors: fc.array(arbitraryDomainLiteral(), { minLength: MIN_ERRORS, maxLength: MAX_ERRORS }),
  });
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

export const JOURNAL_REPORTER_TEST_GENERATOR = {
  runScenario: arbitraryRunScenario,
  mixedRunScenario: arbitraryMixedRunScenario,
  runCase: arbitraryRunCase,
  passingCase: arbitraryPassingCase,
  failingCase: arbitraryFailingCase,
  scopeUnit: arbitraryScopeUnit,
  scopeUnits: arbitraryScopeUnits,
  finding: arbitraryFinding,
  findings: arbitraryFindings,
  terminalStatus: arbitraryTerminalStatus,
  runRequest: arbitraryRunRequest,
} as const;

export function sampleJournalReporterValue<T>(arbitrary: fc.Arbitrary<T>): T {
  return sampleLiteralTestValue(arbitrary);
}
