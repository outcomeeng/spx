import { resolveConfig } from "@/config/index";
import {
  type ValidationConfig,
  validationConfigDescriptor,
  type ValidationPathConfig,
} from "@/validation/config/descriptor";
import { detectTypeScript } from "@/validation/discovery/index";
import { type LiteralConfig } from "@/validation/literal/config";
import {
  type DetectionResult,
  type DupeFinding,
  type LiteralKind,
  type LiteralLocation,
  type ReuseFinding,
  validateLiteralReuse,
} from "@/validation/literal/index";
import { validationEnabled } from "@/validation/steps/eslint";

export const LITERAL_PROBLEM_KIND = {
  REUSE: "reuse",
  DUPE: "dupe",
} as const;

export type LiteralProblemKind = (typeof LITERAL_PROBLEM_KIND)[keyof typeof LITERAL_PROBLEM_KIND];

export interface LiteralCommandOptions {
  readonly cwd: string;
  readonly files?: readonly string[];
  readonly kind?: LiteralProblemKind;
  readonly filesWithProblems?: boolean;
  readonly literals?: boolean;
  readonly verbose?: boolean;
  readonly json?: boolean;
  readonly quiet?: boolean;
  readonly config?: LiteralConfig;
  readonly pathConfig?: ValidationPathConfig;
}

export interface ValidationCommandResult {
  readonly exitCode: number;
  readonly output: string;
  readonly durationMs: number;
}

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_CONFIG_ERROR = 2;
const TYPESCRIPT_ABSENT_MESSAGE = "⏭ Skipping Literal (TypeScript not detected in project)";
const DISABLED_MESSAGE = "⏭ Skipping Literal (LITERAL_VALIDATION_ENABLED=0)";
export const NO_PROBLEMS_MESSAGE = "Literal: ✓ No problems";

export function formatNoProblemsOfKind(kind: LiteralProblemKind): string {
  return `Literal: No problems of type ${kind}`;
}

interface LiteralProblem {
  readonly problemKind: LiteralProblemKind;
  readonly literalKind: LiteralKind;
  readonly value: string;
  readonly test: LiteralLocation;
  readonly related: readonly LiteralLocation[];
}

export async function literalCommand(
  options: LiteralCommandOptions,
): Promise<ValidationCommandResult> {
  const start = Date.now();

  const tsDetection = detectTypeScript(options.cwd);
  if (!tsDetection.present) {
    return {
      exitCode: EXIT_OK,
      output: options.quiet ? "" : TYPESCRIPT_ABSENT_MESSAGE,
      durationMs: Date.now() - start,
    };
  }

  if (!validationEnabled("LITERAL")) {
    return {
      exitCode: EXIT_OK,
      output: options.quiet ? "" : DISABLED_MESSAGE,
      durationMs: Date.now() - start,
    };
  }

  let resolvedLiteralConfig: LiteralConfig;
  let resolvedPathConfig: ValidationPathConfig;
  if (options.config !== undefined) {
    resolvedLiteralConfig = options.config;
    resolvedPathConfig = options.pathConfig ?? validationConfigDescriptor.defaults.paths;
  } else {
    const loaded = await resolveConfig(options.cwd, [validationConfigDescriptor]);
    if (!loaded.ok) {
      return {
        exitCode: EXIT_CONFIG_ERROR,
        output: `Literal: ✗ config error — ${loaded.error}`,
        durationMs: Date.now() - start,
      };
    }
    const validationConfig = loaded.value[validationConfigDescriptor.section] as ValidationConfig;
    resolvedLiteralConfig = validationConfig.literal.values;
    resolvedPathConfig = validationConfig.paths;
  }

  const result = await validateLiteralReuse({
    projectRoot: options.cwd,
    files: options.files,
    config: resolvedLiteralConfig,
    pathConfig: resolvedPathConfig,
  });

  const filteredFindings = filterLiteralFindings(result.findings, options.kind);
  const totalProblems = countLiteralProblems(filteredFindings);
  const exitCode = totalProblems === 0 ? EXIT_OK : EXIT_FINDINGS;

  const output = options.json
    ? JSON.stringify(filteredFindings)
    : options.quiet
    ? ""
    : formatLiteralCommandOutput(filteredFindings, options);

  return { exitCode, output, durationMs: Date.now() - start };
}

export function filterLiteralFindings(
  findings: DetectionResult,
  kind: LiteralProblemKind | undefined,
): DetectionResult {
  return {
    srcReuse: kind === LITERAL_PROBLEM_KIND.DUPE ? [] : sortReuseFindings(findings.srcReuse),
    testDupe: kind === LITERAL_PROBLEM_KIND.REUSE ? [] : sortDupeFindings(findings.testDupe),
  };
}

export function countLiteralProblems(findings: DetectionResult): number {
  return findings.srcReuse.length + findings.testDupe.length;
}

export function formatDefaultLiteralProblems(findings: DetectionResult): string {
  return toLiteralProblems(findings)
    .map((problem) =>
      `[${problem.problemKind}] ${formatLiteralValue(problem.literalKind, problem.value)} ${formatLoc(problem.test)}`
    )
    .join("\n");
}

export function formatVerboseLiteralProblems(findings: DetectionResult): string {
  const lines = [
    `Literal: ${
      countLiteralProblems(findings)
    } problems (reuse: ${findings.srcReuse.length}, dupe: ${findings.testDupe.length})`,
  ];

  appendVerboseSection(
    lines,
    "REUSE",
    findings.srcReuse.map((finding): LiteralProblem => ({
      problemKind: LITERAL_PROBLEM_KIND.REUSE,
      literalKind: finding.kind,
      value: finding.value,
      test: finding.test,
      related: finding.src,
    })),
  );
  appendVerboseSection(
    lines,
    "DUPE",
    findings.testDupe.map((finding): LiteralProblem => ({
      problemKind: LITERAL_PROBLEM_KIND.DUPE,
      literalKind: finding.kind,
      value: finding.value,
      test: finding.test,
      related: finding.otherTests,
    })),
  );

  return lines.join("\n");
}

export function formatFilesWithProblems(findings: DetectionResult): string {
  return [...new Set(toLiteralProblems(findings).map((problem) => problem.test.file))]
    .sort()
    .join("\n");
}

export function formatLiteralValues(findings: DetectionResult): string {
  const values = new Map<string, { readonly kind: LiteralKind; readonly value: string }>();
  for (const problem of toLiteralProblems(findings)) {
    values.set(`${problem.literalKind}\0${problem.value}`, {
      kind: problem.literalKind,
      value: problem.value,
    });
  }
  return [...values.values()]
    .sort((left, right) => left.value.localeCompare(right.value) || left.kind.localeCompare(right.kind))
    .map((entry) => formatLiteralValue(entry.kind, entry.value))
    .join("\n");
}

function formatLiteralCommandOutput(
  findings: DetectionResult,
  options: LiteralCommandOptions,
): string {
  const totalProblems = countLiteralProblems(findings);

  if (totalProblems === 0 && options.kind !== undefined) {
    return formatNoProblemsOfKind(options.kind);
  }

  if (totalProblems === 0) {
    return options.filesWithProblems || options.literals || options.verbose ? "" : NO_PROBLEMS_MESSAGE;
  }

  if (options.filesWithProblems) return formatFilesWithProblems(findings);
  if (options.literals) return formatLiteralValues(findings);
  if (options.verbose) return formatVerboseLiteralProblems(findings);
  return formatDefaultLiteralProblems(findings);
}

function toLiteralProblems(findings: DetectionResult): readonly LiteralProblem[] {
  return [
    ...sortReuseFindings(findings.srcReuse).map((finding): LiteralProblem => ({
      problemKind: LITERAL_PROBLEM_KIND.REUSE,
      literalKind: finding.kind,
      value: finding.value,
      test: finding.test,
      related: finding.src,
    })),
    ...sortDupeFindings(findings.testDupe).map((finding): LiteralProblem => ({
      problemKind: LITERAL_PROBLEM_KIND.DUPE,
      literalKind: finding.kind,
      value: finding.value,
      test: finding.test,
      related: finding.otherTests,
    })),
  ];
}

function appendVerboseSection(
  lines: string[],
  heading: string,
  problems: readonly LiteralProblem[],
): void {
  const sortedProblems = [...problems].sort(compareLiteralProblems);
  if (sortedProblems.length === 0) return;

  lines.push(heading);
  let currentFile: string | undefined;
  for (const problem of sortedProblems) {
    if (problem.test.file !== currentFile) {
      lines.push(problem.test.file);
      currentFile = problem.test.file;
    }
    lines.push(
      `  line ${problem.test.line}: ${formatLiteralValue(problem.literalKind, problem.value)} also in ${
        problem.related.map(formatLoc).join(", ")
      }`,
    );
  }
}

function sortReuseFindings(findings: readonly ReuseFinding[]): readonly ReuseFinding[] {
  return [...findings].sort(compareFindings);
}

function sortDupeFindings(findings: readonly DupeFinding[]): readonly DupeFinding[] {
  return [...findings].sort(compareFindings);
}

function compareFindings(
  left: { readonly kind: LiteralKind; readonly value: string; readonly test: LiteralLocation },
  right: { readonly kind: LiteralKind; readonly value: string; readonly test: LiteralLocation },
): number {
  return (
    left.test.file.localeCompare(right.test.file)
    || left.test.line - right.test.line
    || left.kind.localeCompare(right.kind)
    || left.value.localeCompare(right.value)
  );
}

function compareLiteralProblems(left: LiteralProblem, right: LiteralProblem): number {
  return (
    left.test.file.localeCompare(right.test.file)
    || left.test.line - right.test.line
    || left.literalKind.localeCompare(right.literalKind)
    || left.value.localeCompare(right.value)
  );
}

function formatLiteralValue(kind: LiteralKind, value: string): string {
  return kind === "string" ? `"${value}"` : value;
}

function formatLoc(loc: LiteralLocation): string {
  return `${loc.file}:${loc.line}`;
}
