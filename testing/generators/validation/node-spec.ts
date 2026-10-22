/**
 * Generators for canonical-form and prior-form node specs that carry front-matter `id` and
 * `malleability` values, with the classification each value has by construction.
 *
 * Every candidate `id` is built from the parts of the UUID layout, so whether validation admits it
 * is fixed by how the generator assembled it and is never recomputed from the production predicate.
 */
import { join } from "node:path";

import * as fc from "fast-check";

import { NODE_STATUS_MALLEABILITY } from "@/lib/node-status/claim";
import { KIND_REGISTRY, OUTPUT_KINDS, SPEC_TREE_CONFIG, SPEC_TREE_INHERIT_FROM_PARENT } from "@/lib/spec-tree/config";
import type { OutputKind } from "@/lib/spec-tree/config";

/** The front-matter keys a node spec declares for its identity and its malleability. */
export const NODE_SPEC_FRONT_MATTER_KEY = {
  ID: "id",
  MALLEABILITY: "malleability",
} as const;

export const FRONT_MATTER_FENCE = "---";
export const SPEC_SUFFIX_CANONICAL = ".spec.md";
const SPEC_SUFFIX_PRIOR = ".md";
const PRIOR_FORM_KIND_SUFFIX = KIND_REGISTRY.enabler.suffix;
const HEX_DIGITS = "0123456789abcdef";
const UUID_VERSION_SEVEN = "7";
const UUID_VARIANT_DIGITS = "89ab";
const UUID_SEGMENT_SEPARATOR = "-";
const UUID_VERSION_INDEX = 14;
const UUID_VARIANT_INDEX = 19;
const TRUNCATED_ID_MIN_LENGTH = 9;
const UUID_TEXT_LENGTH = 36;
const UUID_TIMESTAMP_DIGITS = 12;
const UUID_RAND_A_DIGITS = 3;
const UUID_RAND_B_DIGITS = 3;
const UUID_NODE_DIGITS = 12;
const NODE_DIRECTORY_INDEX_MIN = 10;
const NODE_DIRECTORY_INDEX_MAX = 99;
const NODE_SLUG_PATTERN = /^[a-z]{5,10}$/;
const WORD_ID_PATTERN = /^[g-z]{3,10}-id$/;
const UNSUPPORTED_MALLEABILITY_PATTERN = /^[a-z]{4,10}-layer$/;
const OPENING_BODY_LINES = ["SO THAT the output is observable", "CAN a consumer rely on the output"] as const;

/** The output kinds that carry their own opening keyword (a variant inherits its parent's). */
export const OPENING_OUTPUT_KINDS: readonly OutputKind[] = OUTPUT_KINDS.filter(
  (kind) => KIND_REGISTRY[kind].opening !== SPEC_TREE_INHERIT_FROM_PARENT,
);

function hexDigits(count: number): fc.Arbitrary<string> {
  return fc.array(fc.constantFrom(...HEX_DIGITS), { minLength: count, maxLength: count }).map((digits) =>
    digits.join("")
  );
}

/** A UUID in version 7, RFC 9562 variant, lowercase hyphenated form: the only form validation admits as an `id`. */
export function arbitraryUuidV7(): fc.Arbitrary<string> {
  return fc.tuple(
    hexDigits(UUID_TIMESTAMP_DIGITS),
    hexDigits(UUID_RAND_A_DIGITS),
    fc.constantFrom(...UUID_VARIANT_DIGITS),
    hexDigits(UUID_RAND_B_DIGITS),
    hexDigits(UUID_NODE_DIGITS),
  ).map(([timestamp, randA, variant, randB, node]) =>
    [
      timestamp.slice(0, 8),
      timestamp.slice(8),
      `${UUID_VERSION_SEVEN}${randA}`,
      `${variant}${randB}`,
      node,
    ].join(UUID_SEGMENT_SEPARATOR)
  );
}

function replaceCharacter(text: string, index: number, replacement: string): string {
  return `${text.slice(0, index)}${replacement}${text.slice(index + 1)}`;
}

/** A canonical UUIDv7 with exactly one property broken: the form cannot be admitted. */
export function arbitraryMalformedId(): fc.Arbitrary<string> {
  const notVersionSeven = arbitraryUuidV7().chain((id) =>
    fc.constantFrom(...HEX_DIGITS).filter((digit) => digit !== UUID_VERSION_SEVEN).map((digit) =>
      replaceCharacter(id, UUID_VERSION_INDEX, digit)
    )
  );
  const notRfcVariant = arbitraryUuidV7().chain((id) =>
    fc.constantFrom(...HEX_DIGITS).filter((digit) => !UUID_VARIANT_DIGITS.includes(digit)).map((digit) =>
      replaceCharacter(id, UUID_VARIANT_INDEX, digit)
    )
  );
  const uppercased = arbitraryUuidV7().filter((id) => id.toUpperCase() !== id).map((id) => id.toUpperCase());
  const unhyphenated = arbitraryUuidV7().map((id) => id.replaceAll(UUID_SEGMENT_SEPARATOR, ""));
  const truncated = arbitraryUuidV7().chain((id) =>
    fc.integer({ min: TRUNCATED_ID_MIN_LENGTH, max: UUID_TEXT_LENGTH - 1 }).map((length) => id.slice(0, length))
  );
  const word = fc.stringMatching(WORD_ID_PATTERN);
  return fc.oneof(notVersionSeven, notRfcVariant, uppercased, unhyphenated, truncated, word);
}

/** An `id` candidate and whether it is admitted, decided by how the candidate was assembled. */
export interface NodeIdCandidate {
  readonly value: string;
  readonly admitted: boolean;
}

export function arbitraryNodeIdCandidate(): fc.Arbitrary<NodeIdCandidate> {
  return fc.oneof(
    arbitraryUuidV7().map((value) => ({ value, admitted: true })),
    arbitraryMalformedId().map((value) => ({ value, admitted: false })),
  );
}

/** A node spec file ready to write under a product root. */
export interface NodeSpecFile {
  /** Product-relative path of the spec. */
  readonly path: string;
  /** Spec-tree-relative directory of the node. */
  readonly nodeDirectory: string;
  readonly content: string;
  /** 1-based line of the `id` front-matter entry, or `undefined` when the spec declares none. */
  readonly idLine: number | undefined;
  /** 1-based line of the `malleability` front-matter entry, or `undefined` when the spec declares none. */
  readonly malleabilityLine: number | undefined;
}

export interface NodeSpecSeed {
  readonly index: number;
  readonly slug: string;
  readonly kind: OutputKind;
}

export interface NodeSpecDeclaration {
  /** `undefined` leaves the `id` entry out of the front matter. */
  readonly id?: string;
  /** `undefined` leaves the `malleability` entry out of the front matter. */
  readonly malleability?: string;
}

function frontMatterLines(declaration: NodeSpecDeclaration): readonly string[] {
  return [
    ...(declaration.id === undefined ? [] : [`${NODE_SPEC_FRONT_MATTER_KEY.ID}: ${JSON.stringify(declaration.id)}`]),
    ...(declaration.malleability === undefined
      ? []
      : [`${NODE_SPEC_FRONT_MATTER_KEY.MALLEABILITY}: ${declaration.malleability}`]),
  ];
}

export function nodeSpecText(
  declaration: NodeSpecDeclaration,
  slug: string,
  opening: string,
): { readonly content: string; readonly idLine: number | undefined; readonly malleabilityLine: number | undefined } {
  const front = frontMatterLines(declaration);
  const head = front.length === 0 ? [] : [FRONT_MATTER_FENCE, ...front, FRONT_MATTER_FENCE, ""];
  const lines = [
    ...head,
    `# ${slug}`,
    "",
    `${opening} ${slug} behavior`,
    ...OPENING_BODY_LINES,
    "",
    "## Assertions",
    "",
    `- The ${slug} output is observable`,
    "",
  ];
  const lineOf = (key: string): number | undefined => {
    const entry = lines.findIndex((line) => line.startsWith(`${key}: `));
    return entry < 0 ? undefined : entry + 1;
  };
  return {
    content: lines.join("\n"),
    idLine: lineOf(NODE_SPEC_FRONT_MATTER_KEY.ID),
    malleabilityLine: lineOf(NODE_SPEC_FRONT_MATTER_KEY.MALLEABILITY),
  };
}

/** A canonical-form node spec: an output-kind directory holding `{slug}.spec.md`, opened by its kind's keyword. */
export function canonicalNodeSpec(seed: NodeSpecSeed, declaration: NodeSpecDeclaration): NodeSpecFile {
  const nodeDirectory = `${seed.index}-${seed.slug}${KIND_REGISTRY[seed.kind].suffix}`;
  const { content, idLine, malleabilityLine } = nodeSpecText(declaration, seed.slug, KIND_REGISTRY[seed.kind].opening);
  return {
    path: join(SPEC_TREE_CONFIG.ROOT_DIRECTORY, nodeDirectory, `${seed.slug}${SPEC_SUFFIX_CANONICAL}`),
    nodeDirectory,
    content,
    idLine,
    malleabilityLine,
  };
}

/** A prior-form node spec: an enabler directory holding `{slug}.md`. */
export function priorFormNodeSpec(seed: NodeSpecSeed, declaration: NodeSpecDeclaration): NodeSpecFile {
  const nodeDirectory = `${seed.index}-${seed.slug}${PRIOR_FORM_KIND_SUFFIX}`;
  const { content, idLine, malleabilityLine } = nodeSpecText(declaration, seed.slug, KIND_REGISTRY.enabler.opening);
  return {
    path: join(SPEC_TREE_CONFIG.ROOT_DIRECTORY, nodeDirectory, `${seed.slug}${SPEC_SUFFIX_PRIOR}`),
    nodeDirectory,
    content,
    idLine,
    malleabilityLine,
  };
}

export function arbitrarySeed(): fc.Arbitrary<NodeSpecSeed> {
  return fc.record({
    index: fc.integer({ min: NODE_DIRECTORY_INDEX_MIN, max: NODE_DIRECTORY_INDEX_MAX }),
    slug: fc.stringMatching(NODE_SLUG_PATTERN),
    kind: fc.constantFrom(...OPENING_OUTPUT_KINDS),
  });
}

export function arbitrarySeedPair(): fc.Arbitrary<readonly [NodeSpecSeed, NodeSpecSeed]> {
  return fc.tuple(arbitrarySeed(), arbitrarySeed()).filter(([first, second]) => first.slug !== second.slug);
}

export interface IdAbsentScenario {
  readonly spec: NodeSpecFile;
}

export function arbitraryIdAbsentScenario(): fc.Arbitrary<IdAbsentScenario> {
  return arbitrarySeed().map((seed) => ({
    spec: canonicalNodeSpec(seed, { malleability: NODE_STATUS_MALLEABILITY.SPEC }),
  }));
}

export function arbitraryPriorFormIdAbsentScenario(): fc.Arbitrary<IdAbsentScenario> {
  return arbitrarySeed().map((seed) => ({ spec: priorFormNodeSpec(seed, {}) }));
}

export interface IdMalformedScenario {
  readonly spec: NodeSpecFile;
  readonly id: string;
}

export function arbitraryIdMalformedScenario(): fc.Arbitrary<IdMalformedScenario> {
  return fc.tuple(arbitrarySeed(), arbitraryMalformedId()).map(([seed, id]) => ({
    spec: canonicalNodeSpec(seed, { id }),
    id,
  }));
}

export interface IdCandidateScenario {
  readonly spec: NodeSpecFile;
  readonly candidate: NodeIdCandidate;
}

export function arbitraryIdCandidateScenario(): fc.Arbitrary<IdCandidateScenario> {
  return fc.tuple(arbitrarySeed(), arbitraryNodeIdCandidate()).map(([seed, candidate]) => ({
    spec: canonicalNodeSpec(seed, { id: candidate.value }),
    candidate,
  }));
}

export interface IdDuplicateScenario {
  readonly first: NodeSpecFile;
  readonly second: NodeSpecFile;
}

export function arbitraryIdDuplicateScenario(): fc.Arbitrary<IdDuplicateScenario> {
  return fc.tuple(arbitrarySeedPair(), arbitraryUuidV7()).map(([[firstSeed, secondSeed], id]) => ({
    first: canonicalNodeSpec(firstSeed, { id }),
    second: canonicalNodeSpec(secondSeed, { id }),
  }));
}

/** A `malleability` declaration and whether validation admits it. */
export interface MalleabilityRow {
  readonly declared: string | undefined;
  readonly admitted: boolean;
}

/** Every admitted declaration, including the absent one, and a generated unsupported value. */
export function malleabilityRows(unsupported: string): readonly MalleabilityRow[] {
  return [
    { declared: undefined, admitted: true },
    ...Object.values(NODE_STATUS_MALLEABILITY).map((declared) => ({ declared, admitted: true })),
    { declared: unsupported, admitted: false },
  ];
}

export interface MalleabilityScenario {
  readonly seed: NodeSpecSeed;
  readonly id: string;
  readonly unsupported: string;
}

export function arbitraryMalleabilityScenario(): fc.Arbitrary<MalleabilityScenario> {
  return fc.tuple(arbitrarySeed(), arbitraryUuidV7(), fc.stringMatching(UNSUPPORTED_MALLEABILITY_PATTERN)).map((
    [seed, id, unsupported],
  ) => ({ seed, id, unsupported }));
}

export interface IdExcludedScenario {
  readonly excluded: NodeSpecFile;
  readonly validated: NodeSpecFile;
}

/** An excluded spec and a validated spec that carry one `id`. */
export function arbitraryIdExcludedScenario(): fc.Arbitrary<IdExcludedScenario> {
  return arbitraryIdDuplicateScenario().map(({ first, second }) => ({ excluded: first, validated: second }));
}
