/**
 * Generators for the content identity of a verification run's recorded input: start inputs of
 * valid and invalid UTF-8, malformed and mismatching expected digests, and checked-file scenarios
 * whose expected digests and results derive from node:crypto and a construction law over line
 * endings, never from the production digest path.
 */
import * as fc from "fast-check";

import { CONTENT_NORMALIZATION, type ContentNormalization } from "@/lib/verification-input";
import {
  arbitraryByteSequence,
  arbitraryInvalidUtf8,
  arbitraryLineEndingVariants,
  arbitraryProductRelativePath,
  referenceSha256,
} from "@testing/generators/verification-input";

const ENCODER = new TextEncoder();
const LOWERCASE_HEX_DIGEST_LENGTH = 64;
const LINE_TERMINATOR = /[\r\n]/;
const MAX_EDIT_LENGTH = 6;
const BOM_AWARE_UTF8_LABEL = "utf-8";

export const START_INPUT_KIND = {
  TEXT: "text",
  INVALID_UTF8: "invalid-utf8",
  ARBITRARY: "arbitrary",
} as const;

export type StartInputKind = (typeof START_INPUT_KIND)[keyof typeof START_INPUT_KIND];

export interface StartInputScenario {
  readonly kind: StartInputKind;
  /** The bytes the input reader returns. */
  readonly bytes: Uint8Array;
  /** The text the bytes decode to; absent when the bytes are not valid UTF-8. */
  readonly text?: string;
  /** The text under universal-newline normalization; absent when the bytes are not valid UTF-8. */
  readonly canonicalText?: string;
}

/** Bytes and, when they are valid UTF-8, their text under universal-newline normalization. */
export interface DigestedContent {
  readonly bytes: Uint8Array;
  readonly canonicalText?: string;
}

/** The runtime's own strict UTF-8 decoder: the oracle for whether bytes are valid UTF-8. */
export function decodesAsUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder(BOM_AWARE_UTF8_LABEL, { fatal: true, ignoreBOM: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function encodeUtf8(text: string): Uint8Array {
  return ENCODER.encode(text);
}

function arbitraryTextStartInput(): fc.Arbitrary<StartInputScenario> {
  return arbitraryLineEndingVariants().map((variants) => ({
    kind: START_INPUT_KIND.TEXT,
    bytes: encodeUtf8(variants.first),
    text: variants.first,
    canonicalText: variants.canonical,
  }));
}

/** A start input: text under any line-ending style, bytes that are not UTF-8, or arbitrary bytes. */
export function arbitraryStartInput(): fc.Arbitrary<StartInputScenario> {
  return fc.oneof(
    arbitraryTextStartInput(),
    arbitraryInvalidUtf8().map((bytes) => ({ kind: START_INPUT_KIND.INVALID_UTF8, bytes })),
    arbitraryByteSequence().map((bytes) => ({ kind: START_INPUT_KIND.ARBITRARY, bytes })),
  );
}

/** A start input of valid UTF-8 text under any line-ending style. */
export function arbitraryTextInput(): fc.Arbitrary<StartInputScenario> {
  return arbitraryTextStartInput();
}

/** A start input whose bytes strict UTF-8 decoding rejects. */
export function arbitraryInvalidUtf8Input(): fc.Arbitrary<StartInputScenario> {
  return arbitraryInvalidUtf8().map((bytes) => ({ kind: START_INPUT_KIND.INVALID_UTF8, bytes }));
}

function arbitraryLowercaseHex(length: number): fc.Arbitrary<string> {
  return fc.array(fc.constantFrom(..."0123456789abcdef"), { minLength: length, maxLength: length }).map((digits) =>
    digits.join("")
  );
}

/** Strings that are not 64 lowercase hexadecimal characters: too short, too long, uppercase, or non-hexadecimal. */
export function arbitraryMalformedExpectedDigest(): fc.Arbitrary<string> {
  const tooShort = fc.integer({ min: 0, max: LOWERCASE_HEX_DIGEST_LENGTH - 1 }).chain(arbitraryLowercaseHex);
  const tooLong = fc.integer({ min: LOWERCASE_HEX_DIGEST_LENGTH + 1, max: LOWERCASE_HEX_DIGEST_LENGTH + 8 }).chain(
    arbitraryLowercaseHex,
  );
  const uppercase = fc
    .tuple(fc.constantFrom(..."ABCDEF"), arbitraryLowercaseHex(LOWERCASE_HEX_DIGEST_LENGTH - 1))
    .map(([head, tail]) => head + tail);
  const nonHexadecimal = fc
    .tuple(fc.constantFrom(..."ghijklmnopqrstuvwxyz"), arbitraryLowercaseHex(LOWERCASE_HEX_DIGEST_LENGTH - 1))
    .map(([head, tail]) => head + tail);
  return fc.oneof(tooShort, tooLong, uppercase, nonHexadecimal);
}

/** A well-formed expected digest: 64 lowercase hexadecimal characters. */
export function arbitraryWellFormedDigest(): fc.Arbitrary<string> {
  return arbitraryLowercaseHex(LOWERCASE_HEX_DIGEST_LENGTH);
}

/** A well-formed expected digest that differs from `observed`. */
export function arbitraryDigestOtherThan(observed: string): fc.Arbitrary<string> {
  return arbitraryLowercaseHex(LOWERCASE_HEX_DIGEST_LENGTH).filter((digest) => digest !== observed);
}

/** The digest of valid-text bytes under a content normalization, from the independent reference. */
export function referenceDigestUnder(
  normalization: ContentNormalization,
  scenario: DigestedContent,
): string {
  if (normalization === CONTENT_NORMALIZATION.NONE) return referenceSha256(scenario.bytes);
  if (scenario.canonicalText === undefined) {
    throw new Error("content-identity generator: normalized digest requested for bytes that are not valid UTF-8");
  }
  return referenceSha256(scenario.canonicalText);
}

/** How a checked file's content relates to the content recorded at start. */
export const CHECK_FILE_RELATION = {
  IDENTICAL: "identical",
  LINE_ENDING_VARIANT: "line-ending-variant",
  EDITED: "edited",
} as const;

export type CheckFileRelation = (typeof CHECK_FILE_RELATION)[keyof typeof CHECK_FILE_RELATION];

/** The normalization spellings a replay request can carry: omitted, `none`, or a named normalization. */
export const CHECK_NORMALIZATION_SPELLINGS: readonly (ContentNormalization | undefined)[] = [
  undefined,
  ...Object.values(CONTENT_NORMALIZATION),
];

export interface CheckFileScenario {
  readonly relation: CheckFileRelation;
  /** The checked file's product-relative name. */
  readonly path: string;
  readonly recorded: DigestedContent;
  readonly checked: DigestedContent;
}

/**
 * Construction law: identical bytes are equal under every normalization; two spellings of one text
 * under different line endings differ in bytes and agree in universal-newline text; a text with
 * non-line-ending characters appended differs under both.
 */
export function arbitraryCheckFileScenario(relation: CheckFileRelation): fc.Arbitrary<CheckFileScenario> {
  const edit = fc
    .string({ unit: "grapheme", minLength: 1, maxLength: MAX_EDIT_LENGTH })
    .filter((suffix) => !LINE_TERMINATOR.test(suffix));
  return fc
    .tuple(arbitraryLineEndingVariants(), edit, arbitraryProductRelativePath())
    .filter(([variants]) => relation !== CHECK_FILE_RELATION.LINE_ENDING_VARIANT || variants.first !== variants.second)
    .map(([variants, suffix, path]) => {
      const recorded = { bytes: encodeUtf8(variants.first), canonicalText: variants.canonical };
      switch (relation) {
        case CHECK_FILE_RELATION.IDENTICAL:
          return { relation, path, recorded, checked: recorded };
        case CHECK_FILE_RELATION.LINE_ENDING_VARIANT:
          return {
            relation,
            path,
            recorded,
            checked: { bytes: encodeUtf8(variants.second), canonicalText: variants.canonical },
          };
        case CHECK_FILE_RELATION.EDITED:
          return {
            relation,
            path,
            recorded,
            checked: { bytes: encodeUtf8(variants.first + suffix), canonicalText: variants.canonical + suffix },
          };
      }
    });
}

/** Whether the checked file's digest equals the recorded digest under a normalization, by construction. */
export function expectedEqualUnder(relation: CheckFileRelation, normalization: ContentNormalization): boolean {
  switch (relation) {
    case CHECK_FILE_RELATION.IDENTICAL:
      return true;
    case CHECK_FILE_RELATION.LINE_ENDING_VARIANT:
      return normalization === CONTENT_NORMALIZATION.UTF8_UNIVERSAL_NEWLINES;
    case CHECK_FILE_RELATION.EDITED:
      return false;
  }
}

export const VERIFY_CONTENT_IDENTITY_TEST_GENERATOR = {
  startInput: arbitraryStartInput,
  textInput: arbitraryTextInput,
  invalidUtf8Input: arbitraryInvalidUtf8Input,
  malformedExpectedDigest: arbitraryMalformedExpectedDigest,
  wellFormedDigest: arbitraryWellFormedDigest,
  digestOtherThan: arbitraryDigestOtherThan,
  checkFileScenario: arbitraryCheckFileScenario,
  productRelativePath: arbitraryProductRelativePath,
} as const;
