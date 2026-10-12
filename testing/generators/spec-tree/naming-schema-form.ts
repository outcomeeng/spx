/**
 * The filename forms each naming-schema version accepts, as the filename-grammar spec declares them,
 * with the indices the forms accept and reject drawn from generators over the index domain.
 *
 * The expectations come from the spec's per-version statements — the node kinds, the spec-file and
 * root-spec forms, the node-local notes, and the index form — and from no field the library
 * resolves them through. Source-owned tokens (output kinds, decision suffixes, grammar suffixes)
 * are imported from their owners. The 4.0 index form ranges over an open value space, so its
 * candidates and its acceptance verdict are generator-owned: the verdict is a reference reading of
 * the spec's statement, never the library's order pattern.
 *
 * @module generators/spec-tree/naming-schema-form
 */

import * as fc from "fast-check";

import {
  DECISION_SUFFIXES,
  NODE_SUFFIXES,
  OUTPUT_SUFFIXES,
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
} from "@/lib/spec-tree";

const INDEX_SEGMENT_SEPARATOR = ".";
const NODE_SUFFIX_LEAD = ".";
const FRACTION_SEGMENT_MAX_COUNT = 3;
const DIGIT_RUN_SEGMENT_MAX_COUNT = 6;
const FOUR_ZERO_INTEGER_RANGE = { min: 10, max: 99 } as const;
const FOUR_ZERO_FRACTION_RANGE = { min: 0, max: 99 } as const;
const FOUR_ZERO_FRACTION_DIGITS = 2;
const FOUR_ZERO_REJECTED_INTEGER_RANGES = [{ min: 0, max: 9 }, { min: 100, max: 99_999 }] as const;
const FOUR_ZERO_SINGLE_DIGIT_FRACTION_RANGE = { min: 0, max: 9 } as const;
const FOUR_ZERO_INTEGER_DIGITS = 2;
const FREE_FORM_INDEX_ALPHABET = [..."0123456789.ab"];
const FREE_FORM_INDEX_MAX_LENGTH = 12;
const DECIMAL_DIGITS = "0123456789";
const DIGIT_RUN_MAX = 99_999;
const NON_NUMERIC_SEGMENT = fc.stringMatching(/^[a-z]{1,6}$/);

export type NamingSchemaFormExpectation = {
  readonly nodeSuffixes: readonly string[];
  readonly specFileSuffix: string;
  readonly rootSpecSuffix: string;
  readonly rootSpecKind: string | undefined;
  readonly coordinationNotes: readonly string[];
  readonly decisionSuffixes: readonly string[];
};

/** A candidate index with the verdict the spec's statement gives it. */
export type IndexCandidate = {
  readonly index: string;
  readonly accepted: boolean;
};

/** A candidate 4.0 index with the verdict the spec's statement gives it. */
export type FourZeroIndexCandidate = IndexCandidate;

function joinIndex(segments: readonly (number | string)[]): string {
  return segments.join(INDEX_SEGMENT_SEPARATOR);
}

function paddedFraction(range: { readonly min: number; readonly max: number }): fc.Arbitrary<string> {
  return fc.integer(range).map((value) => String(value).padStart(FOUR_ZERO_FRACTION_DIGITS, "0"));
}

function fourZeroFractions(): fc.Arbitrary<readonly string[]> {
  return fc.array(paddedFraction(FOUR_ZERO_FRACTION_RANGE), { maxLength: FRACTION_SEGMENT_MAX_COUNT });
}

function arbitraryFourZeroAcceptedIndex(): fc.Arbitrary<string> {
  return fc
    .tuple(fc.integer(FOUR_ZERO_INTEGER_RANGE), fourZeroFractions())
    .map(([integer, fractions]) => joinIndex([integer, ...fractions]));
}

function arbitraryFourZeroNearMissIndex(): fc.Arbitrary<string> {
  const outOfRangeInteger = fc
    .constantFrom(...FOUR_ZERO_REJECTED_INTEGER_RANGES)
    .chain((range) => fc.integer(range))
    .map(String);
  const zeroPaddedInteger = fc
    .integer(FOUR_ZERO_SINGLE_DIGIT_FRACTION_RANGE)
    .map((value) => String(value).padStart(FOUR_ZERO_INTEGER_DIGITS, "0"));
  const singleDigitFraction = fc
    .tuple(fc.integer(FOUR_ZERO_INTEGER_RANGE), fc.integer(FOUR_ZERO_SINGLE_DIGIT_FRACTION_RANGE))
    .map(([integer, fraction]) => joinIndex([integer, fraction]));
  const nonNumeric = fc
    .tuple(fc.integer(FOUR_ZERO_INTEGER_RANGE), NON_NUMERIC_SEGMENT)
    .map(([integer, segment]) => joinIndex([integer, segment]));
  const trailingSeparator = arbitraryFourZeroAcceptedIndex().map((index) => `${index}${INDEX_SEGMENT_SEPARATOR}`);
  const leadingSeparator = arbitraryFourZeroAcceptedIndex().map((index) => `${INDEX_SEGMENT_SEPARATOR}${index}`);
  return fc.oneof(
    outOfRangeInteger,
    zeroPaddedInteger,
    singleDigitFraction,
    nonNumeric,
    trailingSeparator,
    leadingSeparator,
  );
}

function arbitraryFreeFormIndex(): fc.Arbitrary<string> {
  return fc.string({
    unit: fc.constantFrom(...FREE_FORM_INDEX_ALPHABET),
    minLength: 0,
    maxLength: FREE_FORM_INDEX_MAX_LENGTH,
  });
}

function isDigitRunOfLength(segment: string, length: number): boolean {
  return segment.length === length && [...segment].every((character) => DECIMAL_DIGITS.includes(character));
}

/**
 * The spec's statement of the 4.0 index form read directly: a two-digit integer from `10` to `99`
 * followed by zero or more two-digit fractional segments, split on the segment separator.
 */
function fourZeroIndexVerdict(index: string): boolean {
  const [integer, ...fractions] = index.split(INDEX_SEGMENT_SEPARATOR);
  return isDigitRunOfLength(integer, FOUR_ZERO_INTEGER_DIGITS)
    && Number(integer) >= FOUR_ZERO_INTEGER_RANGE.min
    && fractions.every((fraction) => isDigitRunOfLength(fraction, FOUR_ZERO_FRACTION_DIGITS));
}

function arbitraryFourZeroIndexCandidate(): fc.Arbitrary<FourZeroIndexCandidate> {
  return fc
    .oneof(arbitraryFourZeroAcceptedIndex(), arbitraryFourZeroNearMissIndex(), arbitraryFreeFormIndex())
    .map((index) => ({ index, accepted: fourZeroIndexVerdict(index) }));
}

/** Generators over the open 4.0 index domain: indices the spec accepts by construction, and candidates with the spec's verdict. */
export const FOUR_ZERO_INDEX_GENERATOR = {
  accepted: arbitraryFourZeroAcceptedIndex,
  candidate: arbitraryFourZeroIndexCandidate,
} as const;

function arbitraryDigitRun(): fc.Arbitrary<string> {
  return fc.integer({ min: 0, max: DIGIT_RUN_MAX }).map(String);
}

function arbitraryThreeXAcceptedIndex(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitraryDigitRun(), fc.array(arbitraryDigitRun(), { maxLength: DIGIT_RUN_SEGMENT_MAX_COUNT }))
    .map(([first, rest]) => joinIndex([first, ...rest]));
}

function arbitraryThreeXRejectedIndex(): fc.Arbitrary<string> {
  const trailingSeparator = arbitraryDigitRun().map((run) => `${run}${INDEX_SEGMENT_SEPARATOR}`);
  const leadingSeparator = arbitraryDigitRun().map((run) => `${INDEX_SEGMENT_SEPARATOR}${run}`);
  const emptySegment = fc
    .tuple(arbitraryDigitRun(), arbitraryDigitRun())
    .map(([left, right]) => `${left}${INDEX_SEGMENT_SEPARATOR}${INDEX_SEGMENT_SEPARATOR}${right}`);
  const nonNumeric = NON_NUMERIC_SEGMENT;
  return fc.oneof(trailingSeparator, leadingSeparator, emptySegment, nonNumeric);
}

function isDigitRun(segment: string): boolean {
  return segment.length > 0 && [...segment].every((character) => DECIMAL_DIGITS.includes(character));
}

/** The spec's statement of the 3.x index form read directly: digit runs of any length joined by the segment separator. */
function threeXIndexVerdict(index: string): boolean {
  return index.split(INDEX_SEGMENT_SEPARATOR).every(isDigitRun);
}

function arbitraryThreeXIndexCandidate(): fc.Arbitrary<IndexCandidate> {
  return fc
    .oneof(arbitraryThreeXAcceptedIndex(), arbitraryThreeXRejectedIndex(), arbitraryFreeFormIndex())
    .map((index) => ({ index, accepted: threeXIndexVerdict(index) }));
}

/** Generators over the open 3.x index domain: indices the spec accepts by construction, and candidates with the spec's verdict. */
export const THREE_X_INDEX_GENERATOR = {
  accepted: arbitraryThreeXAcceptedIndex,
  candidate: arbitraryThreeXIndexCandidate,
} as const;

/** What the 4.0 naming-schema version accepts: output-node directories, `{slug}.spec.md`, and `ISSUES.md`. */
export function fourZeroFormExpectation(): NamingSchemaFormExpectation {
  return {
    nodeSuffixes: [...OUTPUT_SUFFIXES, `${NODE_SUFFIX_LEAD}${SPEC_TREE_CONFIG.PRODUCT.KIND}`],
    specFileSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX,
    rootSpecSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX,
    rootSpecKind: SPEC_TREE_CONFIG.PRODUCT.KIND,
    coordinationNotes: [SPEC_TREE_GRAMMAR.COORDINATION_NOTE.ISSUES],
    decisionSuffixes: DECISION_SUFFIXES,
  };
}

/** What the 3.x naming-schema version accepts: `.enabler` and `.outcome` directories, `{slug}.md`, `PLAN.md` and `ISSUES.md`. */
export function threeXFormExpectation(): NamingSchemaFormExpectation {
  return {
    nodeSuffixes: NODE_SUFFIXES,
    specFileSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX,
    rootSpecSuffix: SPEC_TREE_GRAMMAR.PRODUCT_SUFFIX,
    rootSpecKind: undefined,
    coordinationNotes: [SPEC_TREE_GRAMMAR.COORDINATION_NOTE.PLAN, SPEC_TREE_GRAMMAR.COORDINATION_NOTE.ISSUES],
    decisionSuffixes: DECISION_SUFFIXES,
  };
}
