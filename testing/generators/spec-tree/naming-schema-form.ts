/**
 * The filename forms each naming-schema version accepts, as the filename-grammar spec declares them,
 * with the index names the forms accept and reject drawn from generators over the index domain.
 *
 * The expectations come from the spec's per-version statements — the node kinds, the spec-file and
 * root-spec forms, the node-local notes, and the index form — and from no field the library
 * resolves them through. Source-owned tokens (output kinds, decision suffixes, grammar suffixes)
 * are imported from their owners.
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
import { SAMPLE_GENERATOR_PARAMETERS } from "@testing/generators/sample";

const INDEX_SEGMENT_SEPARATOR = ".";
const NODE_SUFFIX_LEAD = ".";
const FRACTION_SEGMENT_MAX_COUNT = 3;
const FOUR_ZERO_INTEGER_RANGE = { min: 10, max: 99 } as const;
const FOUR_ZERO_FRACTION_RANGE = { min: 10, max: 99 } as const;
const FOUR_ZERO_FRACTION_DIGITS = 2;
const FOUR_ZERO_REJECTED_INTEGER_RANGES = [{ min: 0, max: 9 }, { min: 100, max: 99_999 }] as const;
const FOUR_ZERO_SINGLE_DIGIT_FRACTION_RANGE = { min: 0, max: 9 } as const;
const DIGIT_RUN_MAX = 99_999;
const NON_NUMERIC_SEGMENT = fc.stringMatching(/^[a-z]{1,6}$/);
const SAMPLED_INDEX_COUNT = 25;

export type NamingSchemaFormExpectation = {
  readonly nodeSuffixes: readonly string[];
  readonly specFileSuffix: string;
  readonly rootSpecSuffix: string;
  readonly rootSpecKind: string | undefined;
  readonly coordinationNotes: readonly string[];
  readonly decisionSuffixes: readonly string[];
  readonly acceptedIndexes: readonly string[];
  readonly rejectedIndexes: readonly string[];
};

function sampleMany<T>(arbitrary: fc.Arbitrary<T>): readonly T[] {
  return fc.sample(arbitrary, { ...SAMPLE_GENERATOR_PARAMETERS, numRuns: SAMPLED_INDEX_COUNT });
}

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

function arbitraryFourZeroRejectedIndex(): fc.Arbitrary<string> {
  const outOfRangeInteger = fc
    .constantFrom(...FOUR_ZERO_REJECTED_INTEGER_RANGES)
    .chain((range) => fc.integer(range))
    .map(String);
  const singleDigitFraction = fc
    .tuple(fc.integer(FOUR_ZERO_INTEGER_RANGE), fc.integer(FOUR_ZERO_SINGLE_DIGIT_FRACTION_RANGE))
    .map(([integer, fraction]) => joinIndex([integer, fraction]));
  const nonNumeric = fc
    .tuple(fc.integer(FOUR_ZERO_INTEGER_RANGE), NON_NUMERIC_SEGMENT)
    .map(([integer, segment]) => joinIndex([integer, segment]));
  return fc.oneof(outOfRangeInteger, singleDigitFraction, nonNumeric);
}

function arbitraryDigitRun(): fc.Arbitrary<string> {
  return fc.integer({ min: 0, max: DIGIT_RUN_MAX }).map(String);
}

function arbitraryThreeXAcceptedIndex(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitraryDigitRun(), fc.array(arbitraryDigitRun(), { maxLength: FRACTION_SEGMENT_MAX_COUNT }))
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

/** What the 4.0 naming-schema version accepts: output-node directories, `{slug}.spec.md`, `ISSUES.md`, and two-digit indices. */
export function fourZeroFormExpectation(): NamingSchemaFormExpectation {
  return {
    nodeSuffixes: [...OUTPUT_SUFFIXES, `${NODE_SUFFIX_LEAD}${SPEC_TREE_CONFIG.PRODUCT.KIND}`],
    specFileSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX,
    rootSpecSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.CANONICAL_SUFFIX,
    rootSpecKind: SPEC_TREE_CONFIG.PRODUCT.KIND,
    coordinationNotes: [SPEC_TREE_GRAMMAR.COORDINATION_NOTE.ISSUES],
    decisionSuffixes: DECISION_SUFFIXES,
    acceptedIndexes: sampleMany(arbitraryFourZeroAcceptedIndex()),
    rejectedIndexes: sampleMany(arbitraryFourZeroRejectedIndex()),
  };
}

/** What the 3.x naming-schema version accepts: `.enabler` and `.outcome` directories, `{slug}.md`, `PLAN.md` and `ISSUES.md`, and dot-separated digit-run indices. */
export function threeXFormExpectation(): NamingSchemaFormExpectation {
  return {
    nodeSuffixes: NODE_SUFFIXES,
    specFileSuffix: SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX,
    rootSpecSuffix: SPEC_TREE_GRAMMAR.PRODUCT_SUFFIX,
    rootSpecKind: undefined,
    coordinationNotes: [SPEC_TREE_GRAMMAR.COORDINATION_NOTE.PLAN, SPEC_TREE_GRAMMAR.COORDINATION_NOTE.ISSUES],
    decisionSuffixes: DECISION_SUFFIXES,
    acceptedIndexes: sampleMany(arbitraryThreeXAcceptedIndex()),
    rejectedIndexes: sampleMany(arbitraryThreeXRejectedIndex()),
  };
}
