/**
 * Markdown validation command.
 *
 * Runs markdownlint-cli2 for markdown link integrity and structural quality.
 * Unlike other validation commands, this does not use discoverTool() --
 * markdownlint-cli2 is a production dependency, always available.
 */

import { isAbsolute, join } from "node:path";

import { resolveConfig } from "@/config/index";
import {
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  type ValidationConfig,
  validationConfigDescriptor,
  type ValidationPathFilterConfig,
} from "@/validation/config/descriptor";
import {
  toProductRelativeValidationPath,
  validationPathFilterExcludes,
  validationPathFilterForTool,
  validationPathFilterIntersections,
} from "@/validation/config/path-filter";
import {
  getDefaultDirectories,
  type MarkdownSkippedValidationTarget,
  type MarkdownValidationTarget,
  resolveMarkdownValidationTarget,
  validateMarkdown,
} from "@/validation/steps/markdown";
import {
  formatValidationProblemsFoundMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_PROBLEM_TERMS,
  VALIDATION_SKIP_LABELS,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "./messages";
import type { MarkdownCommandOptions, ValidationCommandResult } from "./types";

/**
 * Run markdown validation.
 *
 * Validates markdown files in the specified directories (or defaults to
 * spx/ and docs/). Returns structured results with exit code and output.
 *
 * @param options - Command options including cwd and optional file scoping
 * @returns Command result with exit code and output
 *
 * @example
 * ```typescript
 * // Validate default directories
 * const result = await markdownCommand({ cwd: process.cwd() });
 *
 * // Validate specific directories
 * const result = await markdownCommand({
 *   cwd: process.cwd(),
 *   files: ["/path/to/spx"],
 * });
 * ```
 */
export const MARKDOWN_COMMAND_OUTPUT = {
  NO_ISSUES: VALIDATION_COMMAND_OUTPUT.MARKDOWN_NO_ISSUES,
  PROBLEM_TERM: VALIDATION_PROBLEM_TERMS.SINGULAR,
  SKIPPED_FILE_SCOPE_PREFIX: "Markdown skipped file scope",
} as const;
const MARKDOWN_CONFIG_ERROR_MESSAGE = `${VALIDATION_STAGE_DISPLAY_NAMES.MARKDOWN}: ✗ config error`;

export async function markdownCommand(options: MarkdownCommandOptions): Promise<ValidationCommandResult> {
  const { cwd, files, quiet } = options;
  const startTime = Date.now();
  const loaded = await resolveConfig(cwd, [validationConfigDescriptor]);
  if (!loaded.ok) {
    return {
      exitCode: 1,
      output: `${MARKDOWN_CONFIG_ERROR_MESSAGE} — ${loaded.error}`,
      durationMs: Date.now() - startTime,
    };
  }
  const validationConfig = loaded.value[validationConfigDescriptor.section] as ValidationConfig;
  const pathFilter = validationPathFilterForTool(
    validationConfig.paths,
    VALIDATION_PATH_TOOL_SUBSECTIONS.MARKDOWN,
  );

  const targetResolutions = files && files.length > 0
    ? files.map((filePath) => resolveMarkdownValidationTarget(markdownValidationOperandPath(cwd, filePath)))
    : undefined;
  const explicitTargets = targetResolutions === undefined
    ? undefined
    : targetResolutions
      .map((resolution) => resolution.target)
      .filter((target): target is MarkdownValidationTarget => target !== undefined);
  const unfilteredTargets: MarkdownValidationTarget[] = targetResolutions === undefined
    ? defaultMarkdownTargets(cwd, pathFilter)
    : explicitTargets ?? [];
  const targets = unfilteredTargets;
  const skippedTargets = targetResolutions === undefined
    ? []
    : targetResolutions
      .map((resolution) => resolution.skipped)
      .filter((skipped): skipped is MarkdownSkippedValidationTarget => skipped !== undefined);
  const skippedOutput = quiet ? [] : skippedTargets.map(formatSkippedFileScope);

  if (targets.length === 0) {
    const reason = files && files.length > 0
      ? VALIDATION_SKIP_LABELS.MARKDOWN_NO_SCOPE_REASON
      : VALIDATION_SKIP_LABELS.MARKDOWN_NO_DEFAULT_DIRECTORIES_REASON;
    const output = quiet ? "" : [
      ...skippedOutput,
      `${VALIDATION_STAGE_DISPLAY_NAMES.MARKDOWN}: skipped (${reason})`,
    ].join("\n");
    return { exitCode: 0, output, durationMs: Date.now() - startTime };
  }

  // Run markdown validation
  const result = await validateMarkdown({
    targets,
    productDir: cwd,
    validationPathExcludes: validationPathFilterExcludes(pathFilter),
  });
  const durationMs = Date.now() - startTime;

  return formatMarkdownResult(result, skippedOutput, quiet, durationMs);
}

function markdownValidationOperandPath(productDir: string, filePath: string): string {
  return isAbsolute(filePath) ? filePath : join(productDir, filePath);
}

function defaultMarkdownTargets(
  productDir: string,
  pathFilter: ValidationPathFilterConfig,
): MarkdownValidationTarget[] {
  return getDefaultDirectories(productDir).flatMap((directory) =>
    validationPathFilterIntersections(toProductRelativeValidationPath(productDir, directory), pathFilter)
      .map((intersection) => resolveMarkdownValidationTarget(join(productDir, intersection)).target)
      .filter((target): target is MarkdownValidationTarget => target !== undefined)
  );
}

function formatSkippedFileScope(target: MarkdownSkippedValidationTarget): string {
  return `${MARKDOWN_COMMAND_OUTPUT.SKIPPED_FILE_SCOPE_PREFIX}: ${target.path} (${target.reason})`;
}

function formatMarkdownResult(
  result: Awaited<ReturnType<typeof validateMarkdown>>,
  skippedOutput: readonly string[],
  quiet: boolean | undefined,
  durationMs: number,
): ValidationCommandResult {
  if (result.success) {
    const output = quiet ? "" : [...skippedOutput, MARKDOWN_COMMAND_OUTPUT.NO_ISSUES].join("\n");
    return { exitCode: 0, output, durationMs };
  }
  const errorLines = result.errors.map(
    (error) => `  ${error.file}:${error.line} ${error.detail}`,
  );
  const output = [
    ...skippedOutput,
    formatValidationProblemsFoundMessage(VALIDATION_STAGE_DISPLAY_NAMES.MARKDOWN, {
      count: result.errors.length,
    }),
    ...errorLines,
  ].join("\n");
  return { exitCode: 1, output, durationMs };
}
