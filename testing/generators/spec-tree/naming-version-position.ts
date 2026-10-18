/**
 * Version tuples built around a member chosen as the highest, in every ordering.
 *
 * The highest member is fixed by construction: its major component exceeds every other member's major
 * component, so the expected maximum comes from how the tuple is built and never from a computation over
 * the finished tuple. Lower members carry large minor and patch components, so a comparison that reads
 * the identifier as text or as a trailing component selects the wrong member.
 */
import * as fc from "fast-check";

import { type NamingSchemaVersion, SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS } from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";

const POSITION_OPTIONS = {
  LOWER_COUNT: 3,
  LOWER_MAJOR_MAX: 10,
  LOWER_TAIL_MAX: 99,
  HIGHEST_MAJOR_MIN: 11,
  HIGHEST_MAJOR_MAX: 30,
  HIGHEST_TAIL_MAX: 9,
} as const;

const IDENTIFIER_SEPARATOR = ".";

export type HighestPositionCase = {
  readonly title: string;
  readonly versions: readonly NamingSchemaVersion[];
  /** The member the construction made highest. */
  readonly highest: NamingSchemaVersion;
};

function permutations<T>(items: readonly T[]): readonly (readonly T[])[] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest])
  );
}

function arbitraryIdentifier(majorMin: number, majorMax: number, tailMax: number): fc.Arbitrary<string> {
  return fc
    .tuple(fc.integer({ min: majorMin, max: majorMax }), fc.nat({ max: tailMax }), fc.nat({ max: tailMax }))
    .map((components) => components.join(IDENTIFIER_SEPARATOR));
}

/** Every ordering of one tuple holding a constructed highest member beside lower members. */
export function highestPositionCases(): readonly HighestPositionCase[] {
  const drawn = sampleGeneratedValue(
    fc.record({
      highest: arbitraryIdentifier(
        POSITION_OPTIONS.HIGHEST_MAJOR_MIN,
        POSITION_OPTIONS.HIGHEST_MAJOR_MAX,
        POSITION_OPTIONS.HIGHEST_TAIL_MAX,
      ),
      lowers: fc.array(
        arbitraryIdentifier(0, POSITION_OPTIONS.LOWER_MAJOR_MAX, POSITION_OPTIONS.LOWER_TAIL_MAX),
        { minLength: POSITION_OPTIONS.LOWER_COUNT, maxLength: POSITION_OPTIONS.LOWER_COUNT },
      ),
    }),
  );
  const [template] = SPEC_TREE_KNOWN_NAMING_SCHEMA_VERSIONS;
  const highest: NamingSchemaVersion = { ...template, version: drawn.highest };
  const lowers = drawn.lowers.map((version): NamingSchemaVersion => ({ ...template, version }));
  return permutations([highest, ...lowers]).map((versions, index) => ({
    title: `ordering ${index} places the highest member at position ${versions.indexOf(highest)}`,
    versions,
    highest,
  }));
}
