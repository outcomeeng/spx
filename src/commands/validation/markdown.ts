/**
 * Markdown validation command.
 *
 * Runs markdownlint-cli2 for markdown link integrity and structural quality.
 * Unlike other validation commands, this does not use discoverTool() --
 * markdownlint-cli2 is a production dependency, always available.
 */

import {
  classifyMarkdownValidationTarget,
  getDefaultDirectories,
  MARKDOWN_VALIDATION_TARGET_KIND,
  type MarkdownValidationTarget,
  validateMarkdown,
} from "@/validation/steps/markdown";
import { VALIDATION_COMMAND_OUTPUT, VALIDATION_SKIP_LABELS, VALIDATION_STAGE_DISPLAY_NAMES } from "./messages";
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
  ERROR_SUMMARY_SUFFIX: VALIDATION_COMMAND_OUTPUT.MARKDOWN_ERROR_SUMMARY_SUFFIX,
  NO_ISSUES: VALIDATION_COMMAND_OUTPUT.MARKDOWN_NO_ISSUES,
} as const;

export async function markdownCommand(options: MarkdownCommandOptions): Promise<ValidationCommandResult> {
  const { cwd, files, quiet } = options;
  const startTime = Date.now();

  const targets = files && files.length > 0
    ? files
      .map((filePath) => classifyMarkdownValidationTarget(filePath))
      .filter((target): target is MarkdownValidationTarget => target !== undefined)
    : getDefaultDirectories(cwd).map((path) => ({
      kind: MARKDOWN_VALIDATION_TARGET_KIND.DIRECTORY,
      path,
    }));

  if (targets.length === 0) {
    const reason = files && files.length > 0
      ? VALIDATION_SKIP_LABELS.MARKDOWN_NO_SCOPE_REASON
      : VALIDATION_SKIP_LABELS.MARKDOWN_NO_DEFAULT_DIRECTORIES_REASON;
    const output = quiet ? "" : `${VALIDATION_STAGE_DISPLAY_NAMES.MARKDOWN}: skipped (${reason})`;
    return { exitCode: 0, output, durationMs: Date.now() - startTime };
  }

  // Run markdown validation
  const result = await validateMarkdown({
    targets,
    projectRoot: cwd,
  });
  const durationMs = Date.now() - startTime;

  // Map result to command output
  if (result.success) {
    const output = quiet ? "" : MARKDOWN_COMMAND_OUTPUT.NO_ISSUES;
    return { exitCode: 0, output, durationMs };
  } else {
    const errorLines = result.errors.map(
      (error) => `  ${error.file}:${error.line} ${error.detail}`,
    );
    const output = [`Markdown: ${result.errors.length} ${MARKDOWN_COMMAND_OUTPUT.ERROR_SUMMARY_SUFFIX}`, ...errorLines]
      .join("\n");
    return { exitCode: 1, output, durationMs };
  }
}
