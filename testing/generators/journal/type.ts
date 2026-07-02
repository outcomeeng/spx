import * as fc from "fast-check";

const verificationLikeJournalTypeCases = ["review", "audit", "audit-typescript"];
const MIN_JOURNAL_LIST_LIMIT = 1;
const MAX_UNSAFE_JOURNAL_LIMIT_OFFSET = 1_000;
const INVALID_JOURNAL_LIMIT_PATTERNS = {
  FRACTIONAL: ".",
  NEGATIVE: "-",
  SIGNED: "+",
  WHITESPACE: " ",
} as const;

export function verificationLikeJournalTypes(): readonly string[] {
  return verificationLikeJournalTypeCases;
}

export function arbitraryJournalRunLimit(max: number): fc.Arbitrary<number> {
  return fc.integer({ min: MIN_JOURNAL_LIST_LIMIT, max });
}

export function arbitraryInvalidJournalLimit(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.integer({ max: MIN_JOURNAL_LIST_LIMIT - 1 }).map(String),
    fc
      .integer({ min: MIN_JOURNAL_LIST_LIMIT, max: MAX_UNSAFE_JOURNAL_LIMIT_OFFSET })
      .map((offset) => String(BigInt(Number.MAX_SAFE_INTEGER) + BigInt(offset))),
    fc
      .tuple(
        fc.string({ minLength: 1 }),
        fc.constantFrom(...Object.values(INVALID_JOURNAL_LIMIT_PATTERNS)),
        fc.string(),
      )
      .map(([prefix, invalidToken, suffix]) => `${prefix}${invalidToken}${suffix}`),
  );
}
