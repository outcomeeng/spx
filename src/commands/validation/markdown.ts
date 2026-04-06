/**
 * Markdown validation command.
 *
 * Runs markdownlint-cli2 for markdown link integrity and structural quality.
 * Unlike other validation commands, this does not use discoverTool() --
 * markdownlint-cli2 is a production dependency, always available.
 */

import { getDefaultDirectories, validateMarkdown } from "../../validation/steps/markdown.js";
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
export async function markdownCommand(options: MarkdownCommandOptions): Promise<ValidationCommandResult> {
  const { cwd, files, quiet } = options;
  const startTime = Date.now();

  // Determine directories to validate
  const directories = files && files.length > 0
    ? files
    : getDefaultDirectories(cwd);

  if (directories.length === 0) {
    const output = quiet ? "" : "Markdown: skipped (no spx/ or docs/ directories found)";
    return { exitCode: 0, output, durationMs: Date.now() - startTime };
  }

  // Run markdown validation
  const result = await validateMarkdown({
    directories,
    projectRoot: cwd,
  });
  const durationMs = Date.now() - startTime;

  // Map result to command output
  if (result.success) {
    const output = quiet ? "" : "Markdown: No issues found";
    return { exitCode: 0, output, durationMs };
  } else {
    const errorLines = result.errors.map(
      (error) => `  ${error.file}:${error.line} ${error.detail}`,
    );
    const output = [`Markdown: ${result.errors.length} error(s) found`, ...errorLines].join("\n");
    return { exitCode: 1, output, durationMs };
  }
}
