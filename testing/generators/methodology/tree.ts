/**
 * Generators for the methodology-version domain: exact methodology versions
 * with their structural parts, methodology lines, text that is not a version,
 * and migrating version pairs.
 *
 * Expected values derive from the generated structure — a version's line is its
 * major and minor parts — so a test never recomputes the parse it verifies.
 *
 * @module generators/methodology/tree
 */

import * as fc from "fast-check";

import {
  DEFAULT_METHODOLOGY_SOURCE,
  METHODOLOGY_VERSION_FORM,
  type MethodologyConfig,
  type MethodologyVersionForm,
} from "@/config/methodology";
import { SPEC_TREE_METHODOLOGY_LINE } from "@/lib/spec-tree";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";

const VERSION_COMPONENT_MAX = 999;
const VERSION_SEPARATOR = ".";
const PRERELEASE_SEPARATOR = "-";
const LINE_COMPONENT_COUNT = 2;

/** An exact methodology version with the parts the line derives from. */
export interface GeneratedMethodologyVersion {
  readonly text: string;
  readonly line: string;
}

/** One `MAJOR.MINOR` line spelled in every accepted exact-version form. */
export interface GeneratedMethodologyVersionForms {
  readonly line: string;
  readonly byForm: Readonly<Record<MethodologyVersionForm, string>>;
}

function versionComponent(): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: VERSION_COMPONENT_MAX });
}

/** The 3.x lines a context fixture tree, authored in the 3.x grammar, is read whole under; the spec-tree library owns them. */
export const FIXTURE_AUTHORED_METHODOLOGY_LINES: readonly string[] = [
  SPEC_TREE_METHODOLOGY_LINE.THREE_ZERO,
  SPEC_TREE_METHODOLOGY_LINE.THREE_ONE,
  SPEC_TREE_METHODOLOGY_LINE.THREE_TWO,
];

/** Every methodology line a spec-tree read accepts; the spec-tree library owns them. */
export const READABLE_METHODOLOGY_LINES: readonly string[] = Object.values(SPEC_TREE_METHODOLOGY_LINE);

/** An exact methodology version on a line no spec-tree read accepts. */
export function arbitraryUnreadableMethodologyVersion(): fc.Arbitrary<GeneratedMethodologyVersion> {
  return arbitraryMethodologyVersion().filter((candidate) => !READABLE_METHODOLOGY_LINES.includes(candidate.line));
}

/** One line a context fixture tree's declaration may name. */
export function arbitraryFixtureAuthoredLine(): fc.Arbitrary<string> {
  return fc.constantFrom(...FIXTURE_AUTHORED_METHODOLOGY_LINES);
}

/** A `MAJOR.MINOR` line drawn without constraint: any pair of version components. */
function anyMethodologyLine(): fc.Arbitrary<string> {
  return fc.tuple(versionComponent(), versionComponent()).map((parts) => parts.join(VERSION_SEPARATOR));
}

/** An exact `MAJOR.MINOR.PATCH` version on a drawn line, optionally carrying a prerelease suffix. */
export function arbitraryMethodologyVersion(
  lines: fc.Arbitrary<string> = anyMethodologyLine(),
): fc.Arbitrary<GeneratedMethodologyVersion> {
  return fc.tuple(
    lines,
    versionComponent(),
    fc.option(arbitraryPathSegment(), { nil: undefined }),
  ).map(([line, patch, prerelease]) => {
    const exact = [line, patch].join(VERSION_SEPARATOR);
    return {
      text: prerelease === undefined ? exact : `${exact}${PRERELEASE_SEPARATOR}${prerelease}`,
      line,
    };
  });
}

/** A `MAJOR.MINOR` line on its own, the shape a fetch argument names. */
export function arbitraryMethodologyLine(): fc.Arbitrary<string> {
  return anyMethodologyLine();
}

/** An exact version in the `MAJOR.MINOR` form: the line is the version text itself. */
export function arbitraryMethodologyLineVersion(
  lines: fc.Arbitrary<string> = anyMethodologyLine(),
): fc.Arbitrary<GeneratedMethodologyVersion> {
  return lines.map((line) => ({ text: line, line }));
}

/** One drawn line in both accepted forms, the patched form carrying a drawn patch component. */
export function arbitraryMethodologyVersionForms(
  lines: fc.Arbitrary<string> = anyMethodologyLine(),
): fc.Arbitrary<GeneratedMethodologyVersionForms> {
  return fc.tuple(lines, versionComponent()).map(([line, patch]) => ({
    line,
    byForm: {
      [METHODOLOGY_VERSION_FORM.LINE]: line,
      [METHODOLOGY_VERSION_FORM.PATCHED]: [line, patch].join(VERSION_SEPARATOR),
    },
  }));
}

/** Two lines, each spelled in every accepted form, so a rendering that swaps or repeats them is distinguishable. */
export function arbitraryMethodologyVersionFormsOnDistinctLines(
  lines: fc.Arbitrary<string> = anyMethodologyLine(),
): fc.Arbitrary<readonly [GeneratedMethodologyVersionForms, GeneratedMethodologyVersionForms]> {
  return fc.tuple(arbitraryMethodologyVersionForms(lines), arbitraryMethodologyVersionForms(lines))
    .filter(([first, second]) => first.line !== second.line);
}

/**
 * The shape classes of non-empty text that is not an exact methodology version:
 * one component, words, a word component, or too many components. Each class
 * is its own arbitrary so a consumer can draw every class deterministically.
 */
export function malformedVersionTextShapes(): readonly fc.Arbitrary<string>[] {
  return [
    versionComponent().map(String),
    arbitraryPathSegment(),
    fc.tuple(versionComponent(), arbitraryPathSegment()).map((parts) => parts.join(VERSION_SEPARATOR)),
    fc.array(versionComponent(), { minLength: LINE_COMPONENT_COUNT + 2, maxLength: LINE_COMPONENT_COUNT + 3 })
      .map((parts) => parts.join(VERSION_SEPARATOR)),
  ];
}

/** Non-empty text that is not an exact methodology version, drawn across every malformed shape class. */
export function arbitraryMalformedVersionText(): fc.Arbitrary<string> {
  return fc.oneof(...malformedVersionTextShapes());
}

/** An exact methodology version in either accepted form. */
export function arbitraryAcceptedMethodologyVersion(
  lines: fc.Arbitrary<string> = anyMethodologyLine(),
): fc.Arbitrary<GeneratedMethodologyVersion> {
  return fc.oneof(arbitraryMethodologyVersion(lines), arbitraryMethodologyLineVersion(lines));
}

/** Text that is not an exact methodology version: malformed text or empty. */
export function arbitraryNonVersionText(): fc.Arbitrary<string> {
  return fc.oneof(fc.constant(""), arbitraryMalformedVersionText());
}

/** Two exact `MAJOR.MINOR.PATCH` versions on different lines. */
export function arbitraryMethodologyVersionsOnDistinctLines(
  lines: fc.Arbitrary<string> = anyMethodologyLine(),
): fc.Arbitrary<readonly [GeneratedMethodologyVersion, GeneratedMethodologyVersion]> {
  return fc.tuple(arbitraryMethodologyVersion(lines), arbitraryMethodologyVersion(lines))
    .filter(([first, second]) => first.line !== second.line);
}

/**
 * A methodology declaration whose migration window opens from a version on another line, with both lines
 * taken from the generated structure so a rendering that swaps or repeats them is distinguishable.
 */
export function arbitraryMigratingMethodologyOnDistinctLines(): fc.Arbitrary<{
  readonly methodology: MethodologyConfig;
  readonly line: string;
  readonly migrationLine: string;
}> {
  return arbitraryMethodologyVersionsOnDistinctLines().map(([target, source]) => ({
    methodology: { source: DEFAULT_METHODOLOGY_SOURCE, version: target.text, migratingFrom: source.text },
    line: target.line,
    migrationLine: source.line,
  }));
}
