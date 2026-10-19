/**
 * Names under a node's `tests/` directory that the test-file form accepts and rejects, drawn from
 * generators over the open name domain.
 *
 * The names the form ranges over are an open value space, so the candidates and their acceptance
 * verdicts are generator-owned: each verdict is a reference reading of the spec's statement of the
 * form — `{core}.test.{ext}`, `test_{core}.{ext}`, or `{core}_test.{ext}`, where `{core}` is
 * `{subject}.{evidence}.{level}` with an optional trailing `.{runner}`, `{subject}` and `{runner}`
 * are slugs, and `{ext}` is a word — never the library's recognizer. The evidence modes are
 * `scenario`, `mapping`, `conformance`, `property`, and `compliance`, and the execution levels are
 * `l1`, `l2`, and `l3`, as the spec states them; the verdict and the name domains take them from the
 * literal sets declared here, never from the grammar registry the recognizer reads.
 *
 * @module generators/spec-tree/test-file-form
 */

import * as fc from "fast-check";

import { SPEC_TREE_GRAMMAR, type SpecTreeMethodologyLine } from "@/lib/spec-tree";
import { SPEC_TREE_SOURCE_LINES, SPEC_TREE_TEST_GENERATOR, specTreeGrammarSelectionForLine } from "./spec-tree";

const TEST_MARKER = "test";
const AFFIX_SEPARATOR = "_";
const PREFIX_MARKER = `${TEST_MARKER}${AFFIX_SEPARATOR}`;
const SUFFIX_MARKER = `${AFFIX_SEPARATOR}${TEST_MARKER}`;
const NAME_SEPARATOR = ".";
const WORD_SEPARATOR = "-";
const WORD_PATTERN = /^[a-z][a-z0-9]*$/;
const WORD_SHAPE = /^[a-z][a-z0-9]{0,5}$/;
const SLUG_WORD_MAX_COUNT = 3;
const EVIDENCE_MODES = ["scenario", "mapping", "conformance", "property", "compliance"] as const;
const EXECUTION_LEVELS = ["l1", "l2", "l3"] as const;
const CORE_BASE_SEGMENT_COUNT = 3;
const CORE_RUNNER_SEGMENT_COUNT = 4;
const FREE_FORM_ALPHABET = [..."ab01.-_ABtest"];
const FREE_FORM_MAX_LENGTH = 16;
const NON_SLUG_SEGMENT = fc.constantFrom("Upper", "under_score", "9digit", "", "has space");
const NON_WORD_EXTENSION = fc.constantFrom("Ts", "9ts", "t_s", "", "t-s");
const NON_MODE = fc.constantFrom("unit", "Mapping", "integration", "");
const NON_LEVEL = fc.constantFrom("l0", "l4", "L1", "level1", "");

/** A name under a node's `tests/` directory with the verdict the spec's statement of the form gives it. */
export type TestFileFormCandidate = {
  readonly line: SpecTreeMethodologyLine;
  readonly parentId: string;
  readonly relativePath: string;
  readonly accepted: boolean;
};

function isWord(text: string): boolean {
  return WORD_PATTERN.test(text);
}

function isSlug(text: string): boolean {
  return text.split(WORD_SEPARATOR).every(isWord);
}

function isCore(core: string): boolean {
  const segments = core.split(NAME_SEPARATOR);
  const [subject = "", mode = "", level = "", runner = ""] = segments;
  return (segments.length === CORE_BASE_SEGMENT_COUNT || segments.length === CORE_RUNNER_SEGMENT_COUNT)
    && isSlug(subject)
    && (EVIDENCE_MODES as readonly string[]).includes(mode)
    && (EXECUTION_LEVELS as readonly string[]).includes(level)
    && (segments.length === CORE_BASE_SEGMENT_COUNT || isSlug(runner));
}

function splitAtLastSeparator(text: string): { readonly head: string; readonly tail: string } | null {
  const index = text.lastIndexOf(NAME_SEPARATOR);
  if (index <= 0) return null;
  return { head: text.slice(0, index), tail: text.slice(index + NAME_SEPARATOR.length) };
}

function matchesInfixForm(name: string): boolean {
  const extension = splitAtLastSeparator(name);
  if (extension === null || !isWord(extension.tail)) return false;
  const marker = splitAtLastSeparator(extension.head);
  return marker !== null && marker.tail === TEST_MARKER && isCore(marker.head);
}

function matchesPrefixForm(name: string): boolean {
  if (!name.startsWith(PREFIX_MARKER)) return false;
  const extension = splitAtLastSeparator(name.slice(PREFIX_MARKER.length));
  return extension !== null && isWord(extension.tail) && isCore(extension.head);
}

function matchesSuffixForm(name: string): boolean {
  const extension = splitAtLastSeparator(name);
  if (extension === null || !isWord(extension.tail) || !extension.head.endsWith(SUFFIX_MARKER)) return false;
  return isCore(extension.head.slice(0, extension.head.length - SUFFIX_MARKER.length));
}

/** The spec's statement of the test-file form read directly. */
function testFileFormVerdict(name: string): boolean {
  return matchesInfixForm(name) || matchesPrefixForm(name) || matchesSuffixForm(name);
}

function arbitraryWord(): fc.Arbitrary<string> {
  return fc.stringMatching(WORD_SHAPE);
}

function arbitrarySlug(): fc.Arbitrary<string> {
  return fc.array(arbitraryWord(), { minLength: 1, maxLength: SLUG_WORD_MAX_COUNT }).map((words) =>
    words.join(WORD_SEPARATOR)
  );
}

function arbitraryMode(): fc.Arbitrary<string> {
  return fc.constantFrom(...EVIDENCE_MODES);
}

function arbitraryLevel(): fc.Arbitrary<string> {
  return fc.constantFrom(...EXECUTION_LEVELS);
}

type NameShape = (core: string, extension: string) => string;

const NAME_SHAPES: readonly NameShape[] = [
  (core, extension) => [core, TEST_MARKER, extension].join(NAME_SEPARATOR),
  (core, extension) => `${PREFIX_MARKER}${core}${NAME_SEPARATOR}${extension}`,
  (core, extension) => `${core}${SUFFIX_MARKER}${NAME_SEPARATOR}${extension}`,
];

function arbitraryShape(): fc.Arbitrary<NameShape> {
  return fc.constantFrom(...NAME_SHAPES);
}

function arbitraryCore(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitrarySlug(), arbitraryMode(), arbitraryLevel(), fc.option(arbitrarySlug(), { nil: undefined }))
    .map(([subject, mode, level, runner]) =>
      [subject, mode, level, ...(runner === undefined ? [] : [runner])].join(NAME_SEPARATOR)
    );
}

function arbitraryAcceptedName(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitraryShape(), arbitraryCore(), arbitraryWord())
    .map(([shape, core, extension]) => shape(core, extension));
}

function arbitraryNearMissName(): fc.Arbitrary<string> {
  const droppedLevel = fc
    .tuple(arbitraryShape(), arbitrarySlug(), arbitraryMode(), arbitraryWord())
    .map(([shape, subject, mode, extension]) => shape([subject, mode].join(NAME_SEPARATOR), extension));
  const droppedMode = fc
    .tuple(arbitraryShape(), arbitrarySlug(), arbitraryLevel(), arbitraryWord())
    .map(([shape, subject, level, extension]) => shape([subject, level].join(NAME_SEPARATOR), extension));
  const levelBeforeMode = fc
    .tuple(arbitraryShape(), arbitrarySlug(), arbitraryMode(), arbitraryLevel(), arbitraryWord())
    .map(([shape, subject, mode, level, extension]) => shape([subject, level, mode].join(NAME_SEPARATOR), extension));
  const unregisteredMode = fc
    .tuple(arbitraryShape(), arbitrarySlug(), NON_MODE, arbitraryLevel(), arbitraryWord())
    .map(([shape, subject, mode, level, extension]) => shape([subject, mode, level].join(NAME_SEPARATOR), extension));
  const unregisteredLevel = fc
    .tuple(arbitraryShape(), arbitrarySlug(), arbitraryMode(), NON_LEVEL, arbitraryWord())
    .map(([shape, subject, mode, level, extension]) => shape([subject, mode, level].join(NAME_SEPARATOR), extension));
  const nonSlugSubject = fc
    .tuple(arbitraryShape(), NON_SLUG_SEGMENT, arbitraryMode(), arbitraryLevel(), arbitraryWord())
    .map(([shape, subject, mode, level, extension]) => shape([subject, mode, level].join(NAME_SEPARATOR), extension));
  const nonSlugRunner = fc
    .tuple(arbitraryShape(), arbitrarySlug(), arbitraryMode(), arbitraryLevel(), NON_SLUG_SEGMENT, arbitraryWord())
    .map(([shape, subject, mode, level, runner, extension]) =>
      shape([subject, mode, level, runner].join(NAME_SEPARATOR), extension)
    );
  const nonWordExtension = fc
    .tuple(arbitraryShape(), arbitraryCore(), NON_WORD_EXTENSION)
    .map(([shape, core, extension]) => shape(core, extension));
  const withoutMarker = fc
    .tuple(arbitraryCore(), arbitraryWord())
    .map(([core, extension]) => [core, extension].join(NAME_SEPARATOR));
  return fc.oneof(
    droppedLevel,
    droppedMode,
    levelBeforeMode,
    unregisteredMode,
    unregisteredLevel,
    nonSlugSubject,
    nonSlugRunner,
    nonWordExtension,
    withoutMarker,
  );
}

function arbitraryFreeFormName(): fc.Arbitrary<string> {
  return fc.string({
    unit: fc.constantFrom(...FREE_FORM_ALPHABET),
    minLength: 1,
    maxLength: FREE_FORM_MAX_LENGTH,
  });
}

function arbitraryParentId(line: SpecTreeMethodologyLine): fc.Arbitrary<string> {
  const suffixes = specTreeGrammarSelectionForLine(line).selected.flatMap((version) => version.nodeSuffixes);
  return fc
    .tuple(
      SPEC_TREE_TEST_GENERATOR.filesystemOrder(),
      SPEC_TREE_TEST_GENERATOR.sourceSlug(),
      fc.constantFrom(...suffixes),
    )
    .map(([order, slug, suffix]) => `${order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${suffix}`);
}

function arbitraryCandidateFor(name: fc.Arbitrary<string>): fc.Arbitrary<TestFileFormCandidate> {
  return fc
    .constantFrom(...SPEC_TREE_SOURCE_LINES)
    .chain((line) =>
      fc.tuple(arbitraryParentId(line), name).map(([parentId, fileName]): TestFileFormCandidate => ({
        line,
        parentId,
        relativePath: [parentId, SPEC_TREE_GRAMMAR.EVIDENCE.DIRECTORY_NAME, fileName].join(
          SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
        ),
        accepted: testFileFormVerdict(fileName),
      }))
    );
}

/** Generators over the open test-file name domain: names the spec accepts by construction, and candidates with the spec's verdict. */
export const TEST_FILE_FORM_GENERATOR = {
  accepted: () => arbitraryCandidateFor(arbitraryAcceptedName()),
  candidate: () =>
    arbitraryCandidateFor(fc.oneof(arbitraryAcceptedName(), arbitraryNearMissName(), arbitraryFreeFormName())),
} as const;
