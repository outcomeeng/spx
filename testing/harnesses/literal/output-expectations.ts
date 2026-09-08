/**
 * Expected `spx validation literal` output for the generated reuse fixture.
 *
 * Every expectation derives from two sources only: the fixture's known layout — one reuse
 * literal shared by one source file and one test file, one dupe literal shared by two test
 * files, every literal on line 1 — and the output-modes spec's declared line formats, section
 * shapes, and orders. Nothing is derived from a `DetectionResult`, and the production
 * formatter's sorting, grouping, and de-duplication are never replayed here, so a formatter
 * defect cannot reach the expected side of an assertion.
 *
 * @module testing/harnesses/literal/output-expectations
 */

import { LITERAL_PROBLEM_KIND, type LiteralProblemKind } from "@/domains/validation/literal-problem-kind";
import { type DetectionResult, LITERAL_KIND, REMEDIATION } from "@/validation/literal";
import type { LiteralReuseFixtureInputs } from "@testing/generators/literal/literal";

/** Every fixture file is a single declaration or assertion, so every literal sits on line 1. */
const LITERAL_FIXTURE_LINE = 1;
/** The fixture yields one src↔test reuse problem and one dupe problem per duplicate test file. */
const FIXTURE_REUSE_PROBLEMS = 1;
const FIXTURE_DUPE_PROBLEMS = 2;

/** The detection result the fixture layout implies, optionally narrowed to one problem kind. */
export function expectedFixtureFindings(
  inputs: LiteralReuseFixtureInputs,
  kind?: LiteralProblemKind,
): DetectionResult {
  const [firstDupeFile, secondDupeFile] = dupeFilesByPath(inputs);
  return {
    srcReuse: kind === LITERAL_PROBLEM_KIND.DUPE
      ? []
      : [{
        kind: LITERAL_KIND.STRING,
        value: inputs.reuseLiteral,
        test: { file: inputs.reuseTestFile, line: LITERAL_FIXTURE_LINE },
        src: [{ file: inputs.reuseSourceFile, line: LITERAL_FIXTURE_LINE }],
        remediation: REMEDIATION.IMPORT_FROM_SOURCE,
      }],
    testDupe: kind === LITERAL_PROBLEM_KIND.REUSE
      ? []
      : [
        {
          kind: LITERAL_KIND.STRING,
          value: inputs.dupeLiteral,
          test: { file: firstDupeFile, line: LITERAL_FIXTURE_LINE },
          otherTests: [{ file: secondDupeFile, line: LITERAL_FIXTURE_LINE }],
          remediation: REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR,
        },
        {
          kind: LITERAL_KIND.STRING,
          value: inputs.dupeLiteral,
          test: { file: secondDupeFile, line: LITERAL_FIXTURE_LINE },
          otherTests: [{ file: firstDupeFile, line: LITERAL_FIXTURE_LINE }],
          remediation: REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR,
        },
      ],
  };
}

/** Default text: `[kind] "value" path:line`, reuse problems first, then dupe problems by file path. */
export function expectedDefaultLines(inputs: LiteralReuseFixtureInputs, kind?: LiteralProblemKind): string[] {
  return [
    ...(kind === LITERAL_PROBLEM_KIND.DUPE
      ? []
      : [problemLine(LITERAL_PROBLEM_KIND.REUSE, inputs.reuseLiteral, inputs.reuseTestFile)]),
    ...(kind === LITERAL_PROBLEM_KIND.REUSE
      ? []
      : dupeFilesByPath(inputs).map((file) => problemLine(LITERAL_PROBLEM_KIND.DUPE, inputs.dupeLiteral, file))),
  ];
}

/** `--files-with-problems`: the affected test files, one per line, lexicographically ordered. */
export function expectedAffectedFiles(inputs: LiteralReuseFixtureInputs, kind?: LiteralProblemKind): string[] {
  return lexicographic([
    ...(kind === LITERAL_PROBLEM_KIND.DUPE ? [] : [inputs.reuseTestFile]),
    ...(kind === LITERAL_PROBLEM_KIND.REUSE ? [] : [inputs.dupeFirstTestFile, inputs.dupeSecondTestFile]),
  ]);
}

/** `--literals`: each distinct string literal in double quotes, one per line, lexicographically ordered. */
export function expectedLiteralLines(inputs: LiteralReuseFixtureInputs, kind?: LiteralProblemKind): string[] {
  return lexicographic([
    ...(kind === LITERAL_PROBLEM_KIND.DUPE ? [] : [quoted(inputs.reuseLiteral)]),
    ...(kind === LITERAL_PROBLEM_KIND.REUSE ? [] : [quoted(inputs.dupeLiteral)]),
  ]);
}

/** The problem counts the `--verbose` summary line states, by kind. */
export interface ExpectedVerboseSummary {
  readonly total: number;
  readonly reuse: number;
  readonly dupe: number;
}

/** One problem line the `--verbose` output indents beneath its file header: the literal and where else it occurs. */
export interface ExpectedVerboseProblem {
  readonly literal: string;
  readonly relatedFile: string;
}

export interface ExpectedVerboseFile {
  readonly header: string;
  readonly problems: readonly ExpectedVerboseProblem[];
}

export interface ExpectedVerboseSection {
  readonly heading: string;
  readonly files: readonly ExpectedVerboseFile[];
}

export function expectedVerboseSummary(): ExpectedVerboseSummary {
  return {
    total: FIXTURE_REUSE_PROBLEMS + FIXTURE_DUPE_PROBLEMS,
    reuse: FIXTURE_REUSE_PROBLEMS,
    dupe: FIXTURE_DUPE_PROBLEMS,
  };
}

/**
 * `--verbose` structure after the summary line: a REUSE section, then a DUPE section, each a
 * sequence of file headers with the file's problem lines indented beneath. Only the structure
 * the spec declares is expected here; the wording of a problem line is the formatter's own.
 */
export function expectedVerboseSections(inputs: LiteralReuseFixtureInputs): ExpectedVerboseSection[] {
  const [firstDupeFile, secondDupeFile] = dupeFilesByPath(inputs);
  return [
    {
      heading: LITERAL_PROBLEM_KIND.REUSE.toUpperCase(),
      files: [{
        header: inputs.reuseTestFile,
        problems: [{ literal: quoted(inputs.reuseLiteral), relatedFile: inputs.reuseSourceFile }],
      }],
    },
    {
      heading: LITERAL_PROBLEM_KIND.DUPE.toUpperCase(),
      files: [
        { header: firstDupeFile, problems: [{ literal: quoted(inputs.dupeLiteral), relatedFile: secondDupeFile }] },
        { header: secondDupeFile, problems: [{ literal: quoted(inputs.dupeLiteral), relatedFile: firstDupeFile }] },
      ],
    },
  ];
}

/** Lexicographic (UTF-16 code unit) order — the order the spec declares for every sorted output mode. */
export function compareExpectedStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function problemLine(kind: LiteralProblemKind, literal: string, file: string): string {
  return `[${kind}] ${quoted(literal)} ${file}:${LITERAL_FIXTURE_LINE}`;
}

function quoted(literal: string): string {
  return `"${literal}"`;
}

function dupeFilesByPath(inputs: LiteralReuseFixtureInputs): readonly [string, string] {
  return compareExpectedStrings(inputs.dupeFirstTestFile, inputs.dupeSecondTestFile) < 0
    ? [inputs.dupeFirstTestFile, inputs.dupeSecondTestFile]
    : [inputs.dupeSecondTestFile, inputs.dupeFirstTestFile];
}

function lexicographic(values: readonly string[]): string[] {
  return [...values].sort(compareExpectedStrings);
}
