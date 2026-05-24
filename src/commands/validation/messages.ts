export const VALIDATION_EXIT_CODES = {
  SUCCESS: 0,
  FAILURE: 1,
} as const;

export const VALIDATION_STAGE_DISPLAY_NAMES = {
  CIRCULAR: "Circular dependencies",
  KNIP: "Knip",
  ESLINT: "ESLint",
  TYPESCRIPT: "TypeScript",
  MARKDOWN: "Markdown",
  LITERAL: "Literal",
} as const;

export const VALIDATION_SKIP_LABELS = {
  VERB: "Skipping",
  LITERAL_REASON: "skip-literal",
  TYPESCRIPT_ABSENT_REASON: "TypeScript not detected in project",
  VALIDATION_PATHS_NO_TARGETS_REASON: "validation paths matched no files",
  MARKDOWN_NO_SCOPE_REASON: "no markdown files in --files scope",
  MARKDOWN_NO_DEFAULT_DIRECTORIES_REASON: "no spx/ or docs/ directories found",
} as const;

export const VALIDATION_COMMAND_OUTPUT = {
  CIRCULAR_FOUND: `${VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR} found`,
  CIRCULAR_NONE_FOUND: `${VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR}: ✓ None found`,
  KNIP_CONFIG_ERROR: `${VALIDATION_STAGE_DISPLAY_NAMES.KNIP}: ✗ config error`,
  KNIP_DISABLED: `${VALIDATION_STAGE_DISPLAY_NAMES.KNIP}: skipped (disabled by validation.knip.enabled)`,
  KNIP_SUCCESS: `${VALIDATION_STAGE_DISPLAY_NAMES.KNIP}: ✓ No unused code found`,
  KNIP_FAILURE: "Unused code found",
  ESLINT_SUCCESS: `${VALIDATION_STAGE_DISPLAY_NAMES.ESLINT}: ✓ No errors found`,
  ESLINT_FAILURE: `${VALIDATION_STAGE_DISPLAY_NAMES.ESLINT} validation failed`,
  ESLINT_MISSING_CONFIG: "ESLint config not found: project has tsconfig.json but no eslint.config.{ts,js,mjs,cjs}",
  TYPESCRIPT_SUCCESS: `${VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT}: ✓ No type errors`,
  TYPESCRIPT_FAILURE: `${VALIDATION_STAGE_DISPLAY_NAMES.TYPESCRIPT} validation failed`,
  MARKDOWN_NO_ISSUES: `${VALIDATION_STAGE_DISPLAY_NAMES.MARKDOWN}: No issues found`,
  MARKDOWN_ERROR_SUMMARY_SUFFIX: "error(s) found",
} as const;

export const LITERAL_SKIP_OUTPUT =
  `${VALIDATION_STAGE_DISPLAY_NAMES.LITERAL}: skipped (--${VALIDATION_SKIP_LABELS.LITERAL_REASON})`;

export const LITERAL_SKIP_JSON_OUTPUT = JSON.stringify({
  skipped: true,
  reason: VALIDATION_SKIP_LABELS.LITERAL_REASON,
});

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
