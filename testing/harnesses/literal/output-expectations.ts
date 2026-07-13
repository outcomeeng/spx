import { LITERAL_PROBLEM_KIND } from "@/domains/validation/literal-problem-kind";
import {
  type DetectionResult,
  LITERAL_KIND,
  type LiteralKind,
  type LiteralLocation,
  REMEDIATION,
} from "@/validation/literal";
import type { LiteralReuseFixtureInputs } from "@testing/generators/literal/literal";

const LITERAL_FIXTURE_LINE = 1;

interface ExpectedProblem {
  readonly kind: string;
  readonly literalKind: LiteralKind;
  readonly value: string;
  readonly test: LiteralLocation;
  readonly related: readonly LiteralLocation[];
}

export function expectedNoProblemsOfKind(kind: string): string {
  return `Literal: No problems of type ${kind}`;
}

export function expectedFixtureFindings(
  inputs: LiteralReuseFixtureInputs,
  kind?: string,
): DetectionResult {
  const duplicateTestFiles = [inputs.dupeFirstTestFile, inputs.dupeSecondTestFile]
    .sort(compareExpectedStrings);
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
      : duplicateTestFiles.map((testFile, index) => ({
        kind: LITERAL_KIND.STRING,
        value: inputs.dupeLiteral,
        test: { file: testFile, line: LITERAL_FIXTURE_LINE },
        otherTests: [{
          file: duplicateTestFiles[index === 0 ? 1 : 0],
          line: LITERAL_FIXTURE_LINE,
        }],
        remediation: REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR,
      })),
  };
}

export function expectedAffectedFiles(findings: DetectionResult): string[] {
  return [...new Set(expectedProblems(findings).map((problem) => problem.test.file))]
    .sort(compareExpectedStrings);
}

export function expectedLiteralLines(findings: DetectionResult): string[] {
  const values = new Map<string, { readonly kind: LiteralKind; readonly value: string }>();
  for (const problem of expectedProblems(findings)) {
    values.set(`${problem.literalKind}\0${problem.value}`, {
      kind: problem.literalKind,
      value: problem.value,
    });
  }
  return [...values.values()]
    .sort((left, right) =>
      compareExpectedStrings(left.value, right.value) || compareExpectedStrings(left.kind, right.kind)
    )
    .map((entry) => expectedLiteralValue(entry.kind, entry.value));
}

export function expectedDefaultLines(findings: DetectionResult): string[] {
  return expectedProblems(findings).map((problem) =>
    `[${problem.kind}] ${expectedLiteralValue(problem.literalKind, problem.value)} ${expectedLocation(problem.test)}`
  );
}

export function expectedVerboseLines(findings: DetectionResult): string[] {
  const lines = [
    `Literal: ${
      findings.srcReuse.length + findings.testDupe.length
    } problems (reuse: ${findings.srcReuse.length}, dupe: ${findings.testDupe.length})`,
  ];
  appendExpectedVerboseSection(
    lines,
    LITERAL_PROBLEM_KIND.REUSE.toUpperCase(),
    expectedProblems({
      srcReuse: findings.srcReuse,
      testDupe: [],
    }),
  );
  appendExpectedVerboseSection(
    lines,
    LITERAL_PROBLEM_KIND.DUPE.toUpperCase(),
    expectedProblems({
      srcReuse: [],
      testDupe: findings.testDupe,
    }),
  );
  return lines;
}

function expectedProblems(findings: DetectionResult): ExpectedProblem[] {
  return [
    ...findings.srcReuse.map((finding) => ({
      kind: LITERAL_PROBLEM_KIND.REUSE,
      literalKind: finding.kind,
      value: finding.value,
      test: finding.test,
      related: finding.src,
    })).sort(compareExpectedProblems),
    ...findings.testDupe.map((finding) => ({
      kind: LITERAL_PROBLEM_KIND.DUPE,
      literalKind: finding.kind,
      value: finding.value,
      test: finding.test,
      related: finding.otherTests,
    })).sort(compareExpectedProblems),
  ];
}

function compareExpectedProblems(left: ExpectedProblem, right: ExpectedProblem): number {
  return compareExpectedStrings(left.test.file, right.test.file)
    || left.test.line - right.test.line
    || compareExpectedStrings(left.literalKind, right.literalKind)
    || compareExpectedStrings(left.value, right.value);
}

export function compareExpectedStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function appendExpectedVerboseSection(
  lines: string[],
  heading: string,
  problems: readonly ExpectedProblem[],
): void {
  if (problems.length === 0) return;
  lines.push(heading);
  let currentFile: string | undefined;
  for (const problem of problems) {
    if (problem.test.file !== currentFile) {
      lines.push(problem.test.file);
      currentFile = problem.test.file;
    }
    lines.push(
      `  line ${problem.test.line}: ${expectedLiteralValue(problem.literalKind, problem.value)} also in ${
        problem.related.map(expectedLocation).join(", ")
      }`,
    );
  }
}

function expectedLiteralValue(kind: LiteralKind, value: string): string {
  return kind === LITERAL_KIND.STRING ? `"${value}"` : value;
}

function expectedLocation(location: LiteralLocation): string {
  return `${location.file}:${location.line}`;
}
