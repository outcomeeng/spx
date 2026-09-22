/**
 * The finite domain the overall-verdict fold is judged over: every subset of the
 * decisive buckets, each presented in both arrangements of the precedence the
 * assertion states.
 *
 * The subsets are enumerated from the source-owned `OVERALL_VERDICT` registry —
 * the buckets the product declares decisive — so the domain follows the
 * product's vocabulary rather than a list written here, and a verdict added
 * there fails to compile until the severity order below places it. The order
 * itself stays the assertion's, never read back from the fold under test. Each
 * subset appears twice —
 * ascending and descending — because a fold that answered by argument position
 * would satisfy one arrangement and fail the other, and a domain presented in
 * one order alone cannot tell a precedence scan from a positional shortcut.
 * Every case carries not-applicable members so the exclusion is exercised
 * throughout. The module supplies the arrangements and the membership; which
 * verdict each must fold to stays in the linked test.
 *
 * @module testing/generators/diagnose/fold-cases
 */

import { OVERALL_VERDICT, type OverallVerdict, VERDICT_BUCKET, type VerdictBucket } from "@/domains/diagnose/types";

/** One arrangement of one subset: the buckets as the fold receives them, and which decisive buckets are present. */
export interface DecisiveBucketArrangement {
  /** Names the subset and its arrangement, so a failing case reports which it was. */
  readonly label: string;
  /** The bucket list handed to the fold, carrying not-applicable members. */
  readonly buckets: readonly VerdictBucket[];
  /** The decisive buckets the subset contains, in no significant order. */
  readonly present: readonly OverallVerdict[];
}

/**
 * Each decisive verdict's place in the severity order the assertion states,
 * least severe first. The key set is the registry's, so a verdict added to
 * `OVERALL_VERDICT` fails to compile until the order names it.
 */
const ASCENDING_SEVERITY_RANK: Readonly<Record<OverallVerdict, number>> = {
  [OVERALL_VERDICT.HEALTHY]: 0,
  [OVERALL_VERDICT.DEGRADED]: 1,
  [OVERALL_VERDICT.UNKNOWN]: 2,
  [OVERALL_VERDICT.BROKEN]: 3,
};

/** The registry's decisive verdicts, ordered by the assertion's severity rank. */
function ascendingSeverity(): readonly OverallVerdict[] {
  return Object.values(OVERALL_VERDICT).sort((left, right) =>
    ASCENDING_SEVERITY_RANK[left] - ASCENDING_SEVERITY_RANK[right]
  );
}

/** Every subset of the decisive buckets, as bitmasks over the severity order. */
function decisiveSubsets(): readonly (readonly OverallVerdict[])[] {
  const ascending = ascendingSeverity();
  return Array.from(
    { length: 2 ** ascending.length },
    (_unused, mask) => ascending.filter((_verdict, index) => (mask & (1 << index)) !== 0),
  );
}

/**
 * Every decisive subset in both arrangements, with not-applicable members
 * surrounding the decisive ones so the exclusion is exercised in every case.
 */
export function decisiveBucketArrangements(): readonly DecisiveBucketArrangement[] {
  return decisiveSubsets().flatMap((present) => {
    const ascending: readonly VerdictBucket[] = present;
    const descending = [...ascending].reverse();
    const surround = (ordered: readonly VerdictBucket[]): readonly VerdictBucket[] => [
      VERDICT_BUCKET.NOT_APPLICABLE,
      ...ordered,
      VERDICT_BUCKET.NOT_APPLICABLE,
    ];
    const name = present.length === 0 ? "the empty subset" : present.join("+");
    return [
      { label: `${name} ascending`, buckets: surround(ascending), present },
      { label: `${name} descending`, buckets: surround(descending), present },
    ];
  });
}
