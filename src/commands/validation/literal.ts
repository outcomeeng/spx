import {
  formatTypeScriptAbsentSkipMessage,
  formatValidationConfigProblemMessage,
  formatValidationNoProblemsMessage,
  formatValidationScopeNoTargetsSkipMessage,
  VALIDATION_SKIP_LABELS,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "@/commands/validation/messages";
import { resolveConfig } from "@/config/index";
import { LITERAL_PROBLEM_KIND, type LiteralProblemKind } from "@/domains/validation/literal-problem-kind";
import { compareAsciiStrings } from "@/lib/state-store";
import {
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  type ValidationConfig,
  validationConfigDescriptor,
  type ValidationPathConfig,
} from "@/validation/config/descriptor";
import { validationPathFilterForTool } from "@/validation/config/path-filter";
import { resolveTypeScriptValidationScope } from "@/validation/config/scope";
import { detectTypeScript } from "@/validation/discovery/index";
import { type LiteralConfig } from "@/validation/literal/config";
import {
  type DetectionResult,
  type DupeFinding,
  type LiteralKind,
  type LiteralLocation,
  type ReuseFinding,
  validateLiteralReuse,
  type ValidateLiteralReuseResult,
} from "@/validation/literal/index";
import { VALIDATION_SCOPES, type ValidationScope } from "@/validation/types";
import { VALIDATION_OUTPUT_TARGET, type ValidationCommandResult } from "./types";

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
  readonly scope?: ValidationScope;
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

export interface LiteralCommandDeps {
  readonly validateLiteralReuse: typeof validateLiteralReuse;
}

export const defaultLiteralCommandDeps: LiteralCommandDeps = {
  validateLiteralReuse,
};

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
export const NO_PROBLEMS_MESSAGE = formatValidationNoProblemsMessage(VALIDATION_STAGE_DISPLAY_NAMES.LITERAL);

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

interface ResolvedLiteralCommandConfig {
  readonly enabled: boolean;
  readonly literalConfig: LiteralConfig;
  readonly pathConfig: ValidationPathConfig;
}

export async function literalCommand(
  options: LiteralCommandOptions,
  deps: LiteralCommandDeps = defaultLiteralCommandDeps,
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

  const resolved = await resolveLiteralCommandConfig(options);
  if (typeof resolved === "string") {
    return {
      exitCode: LITERAL_EXIT_CODES.CONFIG_ERROR,
      output: `${
        formatValidationConfigProblemMessage(
          VALIDATION_STAGE_DISPLAY_NAMES.LITERAL,
          "configuration error",
        )
      } — ${resolved}`,
      durationMs: Date.now() - start,
    };
  }

  if (!resolved.enabled) {
    return {
      exitCode: LITERAL_EXIT_CODES.OK,
      output: options.quiet ? "" : LITERAL_DISABLED_MESSAGE,
      durationMs: Date.now() - start,
    };
  }

  const result = await deps.validateLiteralReuse({
    productDir: options.cwd,
    explicitFiles: explicitLiteralPaths(options.files),
    config: resolved.literalConfig,
    pathConfig: resolved.pathConfig,
    scopeConfig: resolveExplicitLiteralTypeScriptScope(options, resolved.pathConfig),
  });

  const noTargetsMessage = explicitLiteralNoTargetsSkipMessage(options, result);
  if (noTargetsMessage !== undefined) {
    return {
      exitCode: LITERAL_EXIT_CODES.OK,
      output: options.quiet ? "" : noTargetsMessage,
      durationMs: Date.now() - start,
    };
  }

  const filteredFindings = filterLiteralFindings(result.findings, options.kind);
  const totalProblems = countLiteralProblems(filteredFindings);
  const exitCode = totalProblems === 0 ? LITERAL_EXIT_CODES.OK : LITERAL_EXIT_CODES.FINDINGS;

  let output: string;
  if (options.json) {
    output = JSON.stringify(filteredFindings);
  } else if (options.quiet) {
    output = "";
  } else {
    output = formatLiteralCommandOutput(filteredFindings, options);
  }

  return {
    exitCode,
    output,
    durationMs: Date.now() - start,
    outputTarget: VALIDATION_OUTPUT_TARGET.STDOUT,
  };
}

function explicitLiteralNoTargetsSkipMessage(
  options: LiteralCommandOptions,
  result: ValidateLiteralReuseResult,
): string | undefined {
  if (options.files === undefined || options.files.length === 0) {
    return undefined;
  }
  return formatValidationScopeNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.LITERAL, result);
}

async function resolveLiteralCommandConfig(
  options: LiteralCommandOptions,
): Promise<ResolvedLiteralCommandConfig | string> {
  if (options.config !== undefined) {
    return {
      enabled: options.enabled ?? validationConfigDescriptor.defaults.literal.enabled,
      literalConfig: options.config,
      pathConfig: options.pathConfig ?? validationConfigDescriptor.defaults.paths,
    };
  }

  const loaded = await resolveConfig(options.cwd, [validationConfigDescriptor]);
  if (!loaded.ok) return loaded.error;

  const validationConfig = loaded.value[validationConfigDescriptor.section] as ValidationConfig;
  return {
    enabled: validationConfig.literal.enabled,
    literalConfig: validationConfig.literal.values,
    pathConfig: validationPathFilterForTool(
      validationConfig.paths,
      VALIDATION_PATH_TOOL_SUBSECTIONS.LITERAL,
    ),
  };
}

function resolveExplicitLiteralTypeScriptScope(
  options: LiteralCommandOptions,
  pathConfig: ValidationPathConfig,
) {
  if (options.files === undefined || options.files.length === 0) {
    return undefined;
  }
  return resolveTypeScriptValidationScope({
    productDir: options.cwd,
    scope: options.scope ?? VALIDATION_SCOPES.FULL,
    paths: options.files,
    validationPathFilter: pathConfig,
    markExplicitPathsAsValidationFilter: true,
  });
}

function explicitLiteralPaths(files: readonly string[] | undefined): readonly string[] | undefined {
  const explicit = files;
  return explicit === undefined || explicit.length === 0 ? undefined : explicit;
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
    .sort(compareAsciiStrings)
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
    .sort((left, right) => compareAsciiStrings(left.value, right.value) || compareAsciiStrings(left.kind, right.kind))
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
    compareAsciiStrings(left.test.file, right.test.file)
    || left.test.line - right.test.line
    || compareAsciiStrings(left.kind, right.kind)
    || compareAsciiStrings(left.value, right.value)
  );
}

function compareLiteralProblems(left: LiteralProblem, right: LiteralProblem): number {
  return (
    compareAsciiStrings(left.test.file, right.test.file)
    || left.test.line - right.test.line
    || compareAsciiStrings(left.literalKind, right.literalKind)
    || compareAsciiStrings(left.value, right.value)
  );
}

function formatLiteralValue(kind: LiteralKind, value: string): string {
  return kind === "string" ? `"${value}"` : value;
}

function formatLoc(loc: LiteralLocation): string {
  return `${loc.file}:${loc.line}`;
}
