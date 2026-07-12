export const VALIDATION_EXIT_CODES = {
  SUCCESS: 0,
  FAILURE: 1,
} as const;

export const VALIDATION_STAGE_DISPLAY_NAMES = {
  CIRCULAR: "dependency-cruiser",
  KNIP: "Knip",
  ESLINT: "ESLint",
  TYPESCRIPT: "TypeScript",
  MARKDOWN: "Markdown",
  LITERAL: "Literal",
  FORMATTING: "Formatting",
} as const;

export const VALIDATION_SKIP_LABELS = {
  VERB: "Skipping",
  DISABLED_BY_PREFIX: "disabled by",
  TYPESCRIPT_ABSENT_REASON: "TypeScript not detected in product",
  VALIDATION_PATHS_NO_TARGETS_REASON: "validation paths matched no files",
  EXPLICIT_PATHS_NO_TARGETS_REASON: "explicit paths matched no files in tool scope",
  MARKDOWN_NO_SCOPE_REASON: "no markdown files in explicit path scope",
  MARKDOWN_NO_DEFAULT_DIRECTORIES_REASON: "no spx/ or docs/ directories found",
} as const;

export const VALIDATION_STREAMED_STAGE_RESULT = "output streamed";

export const VALIDATION_PROBLEM_TERMS = {
  SINGULAR: "problem",
  PLURAL: "problems",
} as const;

export function formatValidationNoProblemsMessage(stageName: string): string {
  return `${stageName}: ✓ No ${VALIDATION_PROBLEM_TERMS.PLURAL}`;
}

export function formatValidationProblemsFoundMessage(
  stageName: string,
  options: { readonly count?: number; readonly detail?: string } = {},
): string {
  const countPrefix = options.count === undefined ? "" : `${options.count} `;
  const term = options.count === 1 ? VALIDATION_PROBLEM_TERMS.SINGULAR : VALIDATION_PROBLEM_TERMS.PLURAL;
  const detailSuffix = options.detail === undefined ? "" : ` (${options.detail})`;
  return `${stageName}: ${countPrefix}${term} found${detailSuffix}`;
}

export const VALIDATION_COMMAND_OUTPUT = {
  CIRCULAR_FOUND: formatValidationProblemsFoundMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR, {
    detail: "circular dependencies",
  }),
  CIRCULAR_NONE_FOUND: formatValidationNoProblemsMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR),
  KNIP_CONFIG_ERROR: `${VALIDATION_STAGE_DISPLAY_NAMES.KNIP}: ✗ config error`,
  KNIP_DISABLED:
    `${VALIDATION_STAGE_DISPLAY_NAMES.KNIP}: skipped (${VALIDATION_SKIP_LABELS.DISABLED_BY_PREFIX} validation.knip.enabled)`,
  KNIP_SUCCESS: formatValidationNoProblemsMessage(VALIDATION_STAGE_DISPLAY_NAMES.KNIP),
  KNIP_FAILURE: formatValidationProblemsFoundMessage(VALIDATION_STAGE_DISPLAY_NAMES.KNIP, { detail: "unused code" }),
  ESLINT_SUCCESS: formatValidationNoProblemsMessage(VALIDATION_STAGE_DISPLAY_NAMES.ESLINT),
  ESLINT_FAILURE: formatValidationProblemsFoundMessage(VALIDATION_STAGE_DISPLAY_NAMES.ESLINT),
  ESLINT_MISSING_CONFIG: "ESLint config not found: product has tsconfig.json but no eslint.config.{ts,js,mjs,cjs}",
  TYPESCRIPT_SUCCESS: formatValidationNoProblemsMessage(VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT),
  TYPESCRIPT_FAILURE: formatValidationProblemsFoundMessage(VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT),
  MARKDOWN_NO_ISSUES: formatValidationNoProblemsMessage(VALIDATION_STAGE_DISPLAY_NAMES.MARKDOWN),
  FORMATTING_NO_ISSUES: formatValidationNoProblemsMessage(VALIDATION_STAGE_DISPLAY_NAMES.FORMATTING),
  FORMATTING_FAILURE_SUMMARY: formatValidationProblemsFoundMessage(VALIDATION_STAGE_DISPLAY_NAMES.FORMATTING, {
    detail: "unformatted files",
  }),
} as const;

export function formatValidationStageSkipOutput(stageName: string, reason: string): string {
  return `${stageName}: skipped (${reason})`;
}

export function formatValidationStageSkipJsonOutput(reason: string, durationMs: number): string {
  return JSON.stringify({ skipped: true, reason, durationMs });
}

export function formatValidationStageJsonOutput(options: {
  readonly stage: string;
  readonly exitCode: number;
  readonly output: string;
  readonly durationMs?: number;
}): string {
  return JSON.stringify(options);
}

// Matches a pipeline step line `[N/M]`; the step count derives from the registry,
// so the denominator is matched generically rather than pinned to a constant.
export const VALIDATION_STEP_LINE_PATTERN = /^\[(\d+)\/(\d+)\]/gm;
export const VALIDATION_STEP_DURATION_PATTERN = /\((\d+(?:\.\d+)?)(ms|s)\)\s*$/;

export function formatTypeScriptAbsentSkipMessage(stageName: string): string {
  return `⏭ ${VALIDATION_SKIP_LABELS.VERB} ${stageName} (${VALIDATION_SKIP_LABELS.TYPESCRIPT_ABSENT_REASON})`;
}

export function formatValidationPathsNoTargetsSkipMessage(stageName: string): string {
  return `⏭ ${VALIDATION_SKIP_LABELS.VERB} ${stageName} (${VALIDATION_SKIP_LABELS.VALIDATION_PATHS_NO_TARGETS_REASON})`;
}

export function formatExplicitPathsNoTargetsSkipMessage(stageName: string): string {
  return `⏭ ${VALIDATION_SKIP_LABELS.VERB} ${stageName} (${VALIDATION_SKIP_LABELS.EXPLICIT_PATHS_NO_TARGETS_REASON})`;
}

export function formatValidationScopeNoTargetsSkipMessage(
  stageName: string,
  metadata: {
    readonly explicitPathNoMatches?: boolean;
    readonly filteredByValidationPathNoMatches?: boolean;
  },
): string | undefined {
  if (metadata.explicitPathNoMatches) {
    return formatExplicitPathsNoTargetsSkipMessage(stageName);
  }
  if (metadata.filteredByValidationPathNoMatches) {
    return formatValidationPathsNoTargetsSkipMessage(stageName);
  }
  return undefined;
}
