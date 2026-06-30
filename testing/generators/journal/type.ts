import * as fc from "fast-check";

const verificationLikeJournalTypeCases = ["review", "audit", "audit-typescript"];
const MIN_JOURNAL_LIST_LIMIT = 1;

export function verificationLikeJournalTypes(): readonly string[] {
  return verificationLikeJournalTypeCases;
}

export function arbitraryJournalListLimit(max: number): fc.Arbitrary<number> {
  return fc.integer({ min: MIN_JOURNAL_LIST_LIMIT, max });
}
