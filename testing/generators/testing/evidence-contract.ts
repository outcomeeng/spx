import * as fc from "fast-check";

import type { TestingLanguageDescriptor } from "@/test/languages/types";
import { testingRegistry } from "@/test/registry";
import { TEST_PATH_VERDICT, type TestPathVerdictValue, type TestRunnerOutcome } from "@/test/run-state";
import { arbitrarySourceFilePath, arbitrarySpecTreeTestFilePath } from "@testing/generators/literal/literal";

const MIN_RUNS = 1;
const MAX_RUNS = 4;
const MIN_PATHS_PER_RUN = 1;
const MAX_PATHS_PER_RUN = 4;
const MIN_READ_PATHS = 1;
const MAX_READ_PATHS = 4;
const MAX_EXIT_CODE = 255;

/** One runner outcome paired with the registered language descriptor that produced it. */
export interface EvidenceRun {
  readonly language: TestingLanguageDescriptor;
  readonly outcome: TestRunnerOutcome;
}

/** A run of the testing registry: its outcomes, each tied to its language, and the paths each reference read. */
export interface EvidenceContractScenario {
  readonly runs: readonly EvidenceRun[];
  readonly readPathsByReference: ReadonlyMap<string, readonly string[]>;
}

export const EVIDENCE_CONTRACT_GENERATOR = {
  scenario: arbitraryEvidenceContractScenario,
  exitCode: arbitraryExitCode,
  verdict: arbitraryVerdict,
  outcomeOver: arbitraryOutcomeOver,
  recordedVerdictsOver: arbitraryRecordedVerdictsOver,
} as const;

/** One runner's recorded verdict for an evidence reference, with the exit code of the run that produced it. */
export interface RecordedVerdict {
  readonly language: TestingLanguageDescriptor;
  readonly verdict: TestPathVerdictValue;
  readonly exitCode: number;
}

/**
 * For each reference, the verdicts one to `MAX_RUNS` registered runners recorded for it, drawn over the
 * full verdict domain, so a reference meets every combination of verdicts across runners.
 */
function arbitraryRecordedVerdictsOver(
  references: readonly string[],
): fc.Arbitrary<readonly (readonly RecordedVerdict[])[]> {
  return fc.tuple(
    ...references.map(() =>
      fc.array(
        fc.record({
          language: fc.constantFrom(...testingRegistry.languages),
          verdict: fc.constantFrom(...Object.values(TEST_PATH_VERDICT)),
          exitCode: arbitraryExitCode(),
        }),
        { minLength: MIN_RUNS, maxLength: MAX_RUNS },
      )
    ),
  );
}

/** A path verdict drawn over the full verdict domain. */
function arbitraryVerdict(): fc.Arbitrary<TestPathVerdictValue> {
  return fc.constantFrom(...Object.values(TEST_PATH_VERDICT));
}

/** A runner exit code drawn over its full variable domain. */
function arbitraryExitCode(): fc.Arbitrary<number> {
  return fc.nat({ max: MAX_EXIT_CODE });
}

/**
 * Coherent evidence-contract scenarios: every outcome's runner id is the name of a registered
 * language descriptor, evidence references are unique across the run, and the reported read paths
 * cover a random subset of the references, so supplying and non-supplying languages both meet
 * references that have reported read paths.
 */
function arbitraryEvidenceContractScenario(): fc.Arbitrary<EvidenceContractScenario> {
  return fc
    .uniqueArray(arbitrarySpecTreeTestFilePath(), {
      minLength: MIN_RUNS * MIN_PATHS_PER_RUN,
      maxLength: MAX_RUNS * MAX_PATHS_PER_RUN,
    })
    .chain((references) =>
      fc.record({
        runs: arbitraryRunsOver(references),
        readPathsByReference: arbitraryReadPaths(references),
      })
    );
}

function arbitraryRunsOver(references: readonly string[]): fc.Arbitrary<readonly EvidenceRun[]> {
  return fc
    .array(fc.constantFrom(...testingRegistry.languages), { minLength: MIN_RUNS, maxLength: MAX_RUNS })
    .chain((languages) =>
      fc.array(fc.nat({ max: MAX_PATHS_PER_RUN - MIN_PATHS_PER_RUN }), {
        minLength: languages.length,
        maxLength: languages.length,
      }).chain((extraCounts) => {
        const sliced = sliceReferences(references, extraCounts.map((extra) => extra + MIN_PATHS_PER_RUN));
        return fc.tuple(...sliced.map((paths, index) => arbitraryOutcomeOver(languages[index], paths))).map((
          outcomes,
        ) =>
          outcomes.flatMap((outcome, index) =>
            outcome.testPaths.length === 0 ? [] : [{ language: languages[index], outcome }]
          )
        );
      })
    );
}

function sliceReferences(references: readonly string[], counts: readonly number[]): readonly (readonly string[])[] {
  const slices: (readonly string[])[] = [];
  let cursor = 0;
  for (const count of counts) {
    slices.push(references.slice(cursor, cursor + count));
    cursor += count;
  }
  return slices;
}

function arbitraryOutcomeOver(
  language: TestingLanguageDescriptor,
  paths: readonly string[],
): fc.Arbitrary<TestRunnerOutcome> {
  return fc
    .tuple(
      arbitraryExitCode(),
      fc.array(fc.constantFrom(...Object.values(TEST_PATH_VERDICT)), {
        minLength: paths.length,
        maxLength: paths.length,
      }),
    )
    .map(([exitCode, verdicts]) => ({
      runnerId: language.name,
      testPaths: paths,
      exitCode,
      pathVerdicts: paths.map((testPath, index) => ({ testPath, verdict: verdicts[index] })),
    }));
}

function arbitraryReadPaths(references: readonly string[]): fc.Arbitrary<ReadonlyMap<string, readonly string[]>> {
  return fc
    .tuple(...references.map((reference) =>
      fc.option(
        fc.uniqueArray(arbitrarySourceFilePath(), { minLength: MIN_READ_PATHS, maxLength: MAX_READ_PATHS }),
        { nil: undefined },
      ).map((readPaths) => [reference, readPaths] as const)
    ))
    .map((entries) =>
      new Map(entries.flatMap(([reference, readPaths]) => readPaths === undefined ? [] : [[reference, readPaths]]))
    );
}
