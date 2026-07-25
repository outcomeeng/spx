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
  authoredText,
  externalValue,
  joinTerminalText,
  renderTerminalText,
  terminal,
  type TerminalText,
} from "@/lib/terminal-text/terminal-text";
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

const LITERAL_REPORT_LINE_SEPARATOR = "\n";
const LITERAL_RELATED_LOCATION_SEPARATOR = ", ";
const LITERAL_VERBOSE_PROBLEM_INDENT = "  ";
const LITERAL_STRING_KIND = "string";

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
    const output = options.quiet ? "" : TYPESCRIPT_ABSENT_MESSAGE;
    return {
      exitCode: LITERAL_EXIT_CODES.OK,
      output,
      terminalText: authoredText(output),
      durationMs: Date.now() - start,
    };
  }

  const resolved = await resolveLiteralCommandConfig(options);
  if (typeof resolved === "string") {
    const configProblem = formatValidationConfigProblemMessage(
      VALIDATION_STAGE_DISPLAY_NAMES.LITERAL,
      "configuration error",
    );
    return {
      exitCode: LITERAL_EXIT_CODES.CONFIG_ERROR,
      output: `${configProblem} — ${resolved}`,
      terminalText: terminal`${authoredText(configProblem)} — ${externalValue(resolved)}`,
      durationMs: Date.now() - start,
    };
  }

  if (!resolved.enabled) {
    const output = options.quiet ? "" : LITERAL_DISABLED_MESSAGE;
    return {
      exitCode: LITERAL_EXIT_CODES.OK,
      output,
      terminalText: authoredText(output),
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
    const output = options.quiet ? "" : noTargetsMessage;
    return {
      exitCode: LITERAL_EXIT_CODES.OK,
      output,
      terminalText: authoredText(output),
      durationMs: Date.now() - start,
    };
  }

  const filteredFindings = filterLiteralFindings(result.findings, options.kind);
  const totalProblems = countLiteralProblems(filteredFindings);
  const exitCode = totalProblems === 0 ? LITERAL_EXIT_CODES.OK : LITERAL_EXIT_CODES.FINDINGS;

  let output: string;
  let terminalText: TerminalText;
  if (options.json) {
    output = JSON.stringify(filteredFindings);
    // JSON encoding escapes the control characters a detected literal could carry, so the
    // record is the product's own structured speech by the time it reaches a stream.
    terminalText = authoredText(output);
  } else if (options.quiet) {
    output = "";
    terminalText = authoredText(output);
  } else {
    terminalText = formatLiteralCommandOutput(filteredFindings, options);
    output = renderTerminalText(terminalText);
  }

  return {
    exitCode,
    output,
    terminalText,
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

export function formatDefaultLiteralProblems(findings: DetectionResult): TerminalText {
  return joinTerminalText(
    LITERAL_REPORT_LINE_SEPARATOR,
    toLiteralProblems(findings).map((problem) =>
      terminal`[${authoredText(problem.problemKind)}] ${composeLiteralValue(problem.literalKind, problem.value)} ${
        composeLiteralLocation(problem.test)
      }`
    ),
  );
}

export function formatVerboseLiteralProblems(findings: DetectionResult): TerminalText {
  const lines: TerminalText[] = [
    authoredText(
      `Literal: ${
        countLiteralProblems(findings)
      } problems (reuse: ${findings.srcReuse.length}, dupe: ${findings.testDupe.length})`,
    ),
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

  return joinTerminalText(LITERAL_REPORT_LINE_SEPARATOR, lines);
}

export function formatFilesWithProblems(findings: DetectionResult): TerminalText {
  return joinTerminalText(
    LITERAL_REPORT_LINE_SEPARATOR,
    [...new Set(toLiteralProblems(findings).map((problem) => problem.test.file))]
      .sort(compareAsciiStrings)
      .map((file) => externalValue(file)),
  );
}

export function formatLiteralValues(findings: DetectionResult): TerminalText {
  const values = new Map<string, { readonly kind: LiteralKind; readonly value: string }>();
  for (const problem of toLiteralProblems(findings)) {
    values.set(`${problem.literalKind}\0${problem.value}`, {
      kind: problem.literalKind,
      value: problem.value,
    });
  }
  return joinTerminalText(
    LITERAL_REPORT_LINE_SEPARATOR,
    [...values.values()]
      .sort((left, right) => compareAsciiStrings(left.value, right.value) || compareAsciiStrings(left.kind, right.kind))
      .map((entry) => composeLiteralValue(entry.kind, entry.value)),
  );
}

function formatLiteralCommandOutput(
  findings: DetectionResult,
  options: LiteralCommandOptions,
): TerminalText {
  const totalProblems = countLiteralProblems(findings);

  if (totalProblems === 0 && options.kind !== undefined) {
    return authoredText(formatNoProblemsOfKind(options.kind));
  }

  if (totalProblems === 0) {
    return authoredText(
      options.filesWithProblems || options.literals || options.verbose ? "" : NO_PROBLEMS_MESSAGE,
    );
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
  lines: TerminalText[],
  heading: string,
  problems: readonly LiteralProblem[],
): void {
  const sortedProblems = [...problems].sort(compareLiteralProblems);
  if (sortedProblems.length === 0) return;

  lines.push(authoredText(heading));
  let currentFile: string | undefined;
  for (const problem of sortedProblems) {
    if (problem.test.file !== currentFile) {
      lines.push(externalValue(problem.test.file));
      currentFile = problem.test.file;
    }
    lines.push(
      terminal`${authoredText(LITERAL_VERBOSE_PROBLEM_INDENT)}${authoredText(VERBOSE_PROBLEM_LINE_PREFIX)}${
        authoredText(String(problem.test.line))
      }: ${composeLiteralValue(problem.literalKind, problem.value)} also in ${
        joinTerminalText(LITERAL_RELATED_LOCATION_SEPARATOR, problem.related.map(composeLiteralLocation))
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

/**
 * One detected literal as a report segment. The quoting is spx's own notation; the value itself
 * was read out of a product source file, so it is escaped where it is embedded.
 */
function composeLiteralValue(kind: LiteralKind, value: string): TerminalText {
  return kind === LITERAL_STRING_KIND ? terminal`"${externalValue(value)}"` : externalValue(value);
}

/** A finding's location: the separator is spx's, the file path and line are readings. */
function composeLiteralLocation(loc: LiteralLocation): TerminalText {
  return terminal`${externalValue(loc.file)}:${authoredText(String(loc.line))}`;
}
