import * as fc from "fast-check";

import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";

export const AUDIT_VERDICT_OUTCOME = {
  APPROVED: "approved",
  REJECTED: "rejected",
  INVALID: "invalid",
} as const;

export type AuditVerdictOutcome = (typeof AUDIT_VERDICT_OUTCOME)[keyof typeof AUDIT_VERDICT_OUTCOME];

export interface AuditVerdictCase {
  readonly verdict: string;
  readonly outcome: AuditVerdictOutcome;
}

export interface AuditVerdictTokens {
  readonly approved: string;
  readonly rejected: string;
}

function arbitraryAuditVerdictSeparator(): fc.Arbitrary<string> {
  return fc.constantFrom(" ", "\n", "\n\n", "\t");
}

function arbitraryAuditVerdictExplanation(): fc.Arbitrary<string> {
  return fc
    .array(arbitraryPathSegment(), { minLength: 1, maxLength: 4 })
    .map((words) => words.join(" "));
}

export function arbitraryAuditVerdictCases(
  tokens: AuditVerdictTokens,
): fc.Arbitrary<readonly AuditVerdictCase[]> {
  return fc
    .tuple(
      arbitraryAuditVerdictSeparator(),
      arbitraryAuditVerdictExplanation(),
      arbitraryPathSegment(),
    )
    .map(([separator, explanation, suffix]) => [
      { verdict: tokens.approved, outcome: AUDIT_VERDICT_OUTCOME.APPROVED },
      {
        verdict: `${tokens.approved}${separator}${explanation}`,
        outcome: AUDIT_VERDICT_OUTCOME.APPROVED,
      },
      { verdict: tokens.rejected, outcome: AUDIT_VERDICT_OUTCOME.REJECTED },
      {
        verdict: `${tokens.rejected}${separator}${explanation}`,
        outcome: AUDIT_VERDICT_OUTCOME.REJECTED,
      },
      { verdict: explanation, outcome: AUDIT_VERDICT_OUTCOME.INVALID },
      {
        verdict: `${tokens.approved}${suffix}`,
        outcome: AUDIT_VERDICT_OUTCOME.INVALID,
      },
      {
        verdict: `${tokens.rejected}${suffix}`,
        outcome: AUDIT_VERDICT_OUTCOME.INVALID,
      },
      {
        verdict: `${explanation}${separator}${tokens.approved}`,
        outcome: AUDIT_VERDICT_OUTCOME.INVALID,
      },
    ]);
}
