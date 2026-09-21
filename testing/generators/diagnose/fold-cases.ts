/**
 * The finite domain the overall-verdict fold is judged over: every subset of the
 * decisive buckets, each presented in both arrangements of the precedence the
 * assertion states.
 *
 * The subsets are enumerated from the source-owned `VERDICT_BUCKET` registry
 * with not-applicable removed, so the domain follows the product's bucket
 * vocabulary rather than a list written here. Each subset appears twice —
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

/** The decisive buckets, in the severity order the assertion states, least severe first. */
const ASCENDING_SEVERITY: readonly OverallVerdict[] = [
  OVERALL_VERDICT.HEALTHY,
  OVERALL_VERDICT.DEGRADED,
  OVERALL_VERDICT.UNKNOWN,
  OVERALL_VERDICT.BROKEN,
];

/** Every subset of the decisive buckets, as bitmasks over the severity order. */
function decisiveSubsets(): readonly (readonly OverallVerdict[])[] {
  return Array.from(
    { length: 2 ** ASCENDING_SEVERITY.length },
    (_unused, mask) => ASCENDING_SEVERITY.filter((_verdict, index) => (mask & (1 << index)) !== 0),
  );
}

/**
 * Every decisive subset in both arrangements, with not-applicable members
 * surrounding the decisive ones so the exclusion is exercised in every case.
 */
export function decisiveBucketArrangements(): readonly DecisiveBucketArrangement[] {
  return decisiveSubsets().flatMap((present) => {
    const ascending = present as readonly VerdictBucket[];
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
