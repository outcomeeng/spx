import type { TestEvidenceResult, TestingLanguageDescriptor } from "@/test/languages/types";
import { TEST_PATH_VERDICT, type TestPathVerdictValue, type TestRunnerOutcome } from "@/test/run-state";

/** The part of a runner outcome the evidence contract reads: the runner that produced it and its path verdicts. */
export interface EvidenceOutcome {
  readonly runnerId: TestRunnerOutcome["runnerId"];
  readonly pathVerdicts: TestRunnerOutcome["pathVerdicts"];
}

/** Product-relative paths each evidence reference read, as an adapter that supplies them reports. */
export type ReadPathsByReference = ReadonlyMap<string, readonly string[]>;

/**
 * Builds the language-neutral evidence results of a run: one result per recorded path verdict,
 * carrying its evidence reference and verdict. A result carries read paths only when the owning
 * language's adapter declares that it supplies them and reports some for that reference.
 */
export function buildEvidenceResults<Outcome extends EvidenceOutcome>(
  outcomes: readonly Outcome[],
  languages: readonly TestingLanguageDescriptor[],
  readPathsByReference: ReadPathsByReference = new Map(),
): readonly TestEvidenceResult[] {
  return outcomes.flatMap((outcome) => {
    const supplies = languages.some((language) => language.name === outcome.runnerId && language.suppliesReadPaths);
    return outcome.pathVerdicts.map((pathVerdict): TestEvidenceResult => {
      const readPaths = supplies ? readPathsByReference.get(pathVerdict.testPath) : undefined;
      return readPaths === undefined
        ? { evidenceReference: pathVerdict.testPath, verdict: pathVerdict.verdict }
        : { evidenceReference: pathVerdict.testPath, verdict: pathVerdict.verdict, readPaths };
    });
  });
}

/**
 * Folds evidence results into one verdict without naming the language that produced them:
 * any failed result fails the fold, otherwise any not-run result (or no result) is not-run,
 * otherwise the fold passes.
 */
export function foldEvidenceVerdict(results: readonly TestEvidenceResult[]): TestPathVerdictValue {
  if (results.some((result) => result.verdict === TEST_PATH_VERDICT.FAILED)) return TEST_PATH_VERDICT.FAILED;
  if (results.length === 0 || results.some((result) => result.verdict === TEST_PATH_VERDICT.NOT_RUN)) {
    return TEST_PATH_VERDICT.NOT_RUN;
  }
  return TEST_PATH_VERDICT.PASSED;
}
