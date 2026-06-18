import { resolveConfig } from "@/config/index";
import {
  formatTypeScriptAbsentSkipMessage,
  VALIDATION_SKIP_LABELS,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "@/commands/validation/messages";
import {
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  type ValidationConfig,
  validationConfigDescriptor,
  type ValidationPathConfig,
} from "@/validation/config/descriptor";
import { validationPathFilterForTool } from "@/validation/config/path-filter";
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

export const LITERAL_PROBLEM_KIND = {
  REUSE: "reuse",
  DUPE: "dupe",
} as const;

export type LiteralProblemKind = (typeof LITERAL_PROBLEM_KIND)[keyof typeof LITERAL_PROBLEM_KIND];

export const OUTPUT_MODE_NAME = {
  TEXT: "text",
  VERBOSE: "verbose",
  FILES_WITH_PROBLEMS: "filesWithProblems",
  LITERALS: "literals",
  JSON: "json",
} as const;

export const OUTPUT_MODE_NAMES = Object.values(OUTPUT_MODE_NAME);
export type OutputModeName = (typeof OUTPUT_MODE_NAMES)[number];

export const VERBOSE_PROBLEM_LINE_PREFIX = "line ";

export interface LiteralCommandOptions {
  readonly cwd: string;
  readonly files?: readonly string[];
  readonly kind?: LiteralProblemKind;
  readonly filesWithProblems?: boolean;
  readonly literals?: boolean;
  readonly verbose?: boolean;
  readonly json?: boolean;
  readonly quiet?: boolean;
  readonly enabled?: boolean;
  readonly config?: LiteralConfig;
  readonly pathConfig?: ValidationPathConfig;
}

export interface ValidationCommandResult {
  readonly exitCode: number;
  readonly output: string;
  readonly durationMs: number;
}

export const LITERAL_EXIT_CODES = {
  OK: 0,
  FINDINGS: 1,
  CONFIG_ERROR: 2,
} as const;
const TYPESCRIPT_ABSENT_MESSAGE = formatTypeScriptAbsentSkipMessage(
  VALIDATION_STAGE_DISPLAY_NAMES.LITERAL,
);
export const LITERAL_DISABLED_MESSAGE =
  `⏭ ${VALIDATION_SKIP_LABELS.VERB} ${VALIDATION_STAGE_DISPLAY_NAMES.LITERAL} (${VALIDATION_SKIP_LABELS.DISABLED_BY_PREFIX} validation.literal.enabled)`;
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
      exitCode: LITERAL_EXIT_CODES.OK,
      output: options.quiet ? "" : TYPESCRIPT_ABSENT_MESSAGE,
      durationMs: Date.now() - start,
    };
  }

  let resolvedEnabled: boolean;
  let resolvedLiteralConfig: LiteralConfig;
  let resolvedPathConfig: ValidationPathConfig;
  if (options.config !== undefined) {
    resolvedEnabled = options.enabled ?? validationConfigDescriptor.defaults.literal.enabled;
    resolvedLiteralConfig = options.config;
    resolvedPathConfig = options.pathConfig ?? validationConfigDescriptor.defaults.paths;
  } else {
    const loaded = await resolveConfig(options.cwd, [validationConfigDescriptor]);
    if (!loaded.ok) {
      return {
        exitCode: LITERAL_EXIT_CODES.CONFIG_ERROR,
        output: `Literal: ✗ config error — ${loaded.error}`,
        durationMs: Date.now() - start,
      };
    }
    const validationConfig = loaded.value[validationConfigDescriptor.section] as ValidationConfig;
    resolvedEnabled = validationConfig.literal.enabled;
    resolvedLiteralConfig = validationConfig.literal.values;
    resolvedPathConfig = validationPathFilterForTool(
      validationConfig.paths,
      VALIDATION_PATH_TOOL_SUBSECTIONS.LITERAL,
    );
  }

  if (!resolvedEnabled) {
    return {
      exitCode: LITERAL_EXIT_CODES.OK,
      output: options.quiet ? "" : LITERAL_DISABLED_MESSAGE,
      durationMs: Date.now() - start,
    };
  }

  const result = await validateLiteralReuse({
    productDir: options.cwd,
    files: options.files,
    config: resolvedLiteralConfig,
    pathConfig: resolvedPathConfig,
  });

  const filteredFindings = filterLiteralFindings(result.findings, options.kind);
  const totalProblems = countLiteralProblems(filteredFindings);
  const exitCode = totalProblems === 0 ? LITERAL_EXIT_CODES.OK : LITERAL_EXIT_CODES.FINDINGS;

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
