/**
 * Oracle for the verdicts a node outcome folds from the verdicts recorded for its evidence. It states
 * the two relations the governing decision declares between recorded verdicts and a folded outcome and
 * imports no production fold: a linked reference takes the verdict recorded for its own test path, and
 * evidence folds as passing only when every recorded verdict is passed. It reports facts about the
 * recorded verdicts; the linked test decides what the production outcome must be.
 *
 * @module testing/harnesses/testing/status-oracle
 */
import { TEST_PATH_VERDICT, type TestPathVerdictValue } from "@/test/run-state";

/** The verdict every recorded verdict equals, or undefined when the recorded verdicts differ or none exist. */
export function commonRecordedVerdict(verdicts: readonly TestPathVerdictValue[]): TestPathVerdictValue | undefined {
  const [first] = verdicts;
  return verdicts.every((verdict) => verdict === first) ? first : undefined;
}

/** Whether at least one verdict is recorded and every recorded verdict is passed. */
export function everyRecordedVerdictPassed(verdicts: readonly TestPathVerdictValue[]): boolean {
  return verdicts.length > 0 && verdicts.every((verdict) => verdict === TEST_PATH_VERDICT.PASSED);
}
