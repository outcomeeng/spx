/**
 * Formatting validation command.
 *
 * Runs dprint in check mode for code formatting. Like markdown validation,
 * dprint is an always-present tool with no discovery or skip path. Participation
 * and explicit file scope derive from the resolved `spx.config.*` validation
 * configuration, never from process environment.
 */

import { existsSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

import { resolveConfig } from "@/config/index";
import {
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  type ValidationConfig,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import { pathPassesValidationFilter, validationPathFilterForTool } from "@/validation/config/path-filter";
import { DPRINT_CONFIG_FILENAME, validateFormatting } from "@/validation/steps/formatting";
import { VALIDATION_COMMAND_OUTPUT, VALIDATION_STAGE_DISPLAY_NAMES } from "./messages";
import type { FormattingCommandOptions, ValidationCommandResult } from "./types";

export const FORMATTING_COMMAND_OUTPUT = {
  NO_ISSUES: VALIDATION_COMMAND_OUTPUT.FORMATTING_NO_ISSUES,
  FAILURE_SUMMARY: VALIDATION_COMMAND_OUTPUT.FORMATTING_FAILURE_SUMMARY,
  EMPTY_SCOPE_REASON: "no files in scope",
  NO_CONFIG_SKIP_REASON: `no ${DPRINT_CONFIG_FILENAME} at product root`,
} as const;

const FORMATTING_CONFIG_ERROR_MESSAGE = `${VALIDATION_STAGE_DISPLAY_NAMES.FORMATTING}: ✗ config error`;

/**
 * Run formatting validation.
 *
 * @param options - Command options including cwd and optional file scoping
 * @returns Command result with exit code and output
 */
export async function formattingCommand(options: FormattingCommandOptions): Promise<ValidationCommandResult> {
  const { cwd, files, quiet } = options;
  const startTime = Date.now();

  const loaded = await resolveConfig(cwd, [validationConfigDescriptor]);
  if (!loaded.ok) {
    return {
      exitCode: 1,
      output: `${FORMATTING_CONFIG_ERROR_MESSAGE} — ${loaded.error}`,
      durationMs: Date.now() - startTime,
    };
  }
  const validationConfig = loaded.value[validationConfigDescriptor.section] as ValidationConfig;

  // A product without a root dprint.jsonc has no formatting contract to enforce.
  // Skipping here keeps a personal global dprint config from deciding the
  // verdict — dprint's upward config discovery would otherwise reach it.
  if (!existsSync(join(cwd, DPRINT_CONFIG_FILENAME))) {
    const output = quiet
      ? ""
      : `${VALIDATION_STAGE_DISPLAY_NAMES.FORMATTING}: skipped (${FORMATTING_COMMAND_OUTPUT.NO_CONFIG_SKIP_REASON})`;
    return { exitCode: 0, output, durationMs: Date.now() - startTime };
  }

  const pathFilter = validationPathFilterForTool(
    validationConfig.paths,
    VALIDATION_PATH_TOOL_SUBSECTIONS.FORMATTING,
  );

  // dprint runs with cwd === projectRoot and resolves relative paths against it,
  // so a relative scope passes through unchanged while an absolute scope is
  // relativized to the project root — an absolute path does not match dprint's
  // project-relative include globs.
  const hasExplicitScope = files !== undefined && files.length > 0;
  const scopedFiles = hasExplicitScope
    ? files
      .map((filePath) => (isAbsolute(filePath) ? relative(cwd, filePath) : filePath))
      .filter((relativePath) => pathPassesValidationFilter(relativePath, pathFilter))
    : undefined;

  if (hasExplicitScope && (scopedFiles === undefined || scopedFiles.length === 0)) {
    const output = quiet
      ? ""
      : `${VALIDATION_STAGE_DISPLAY_NAMES.FORMATTING}: skipped (${FORMATTING_COMMAND_OUTPUT.EMPTY_SCOPE_REASON})`;
    return { exitCode: 0, output, durationMs: Date.now() - startTime };
  }

  const result = await validateFormatting({ projectRoot: cwd, files: scopedFiles });
  const durationMs = Date.now() - startTime;

  if (result.success) {
    return { exitCode: 0, output: quiet ? "" : FORMATTING_COMMAND_OUTPUT.NO_ISSUES, durationMs };
  }

  const detail = result.error ?? result.output;
  const output = [FORMATTING_COMMAND_OUTPUT.FAILURE_SUMMARY, detail].filter((line) => line.length > 0).join("\n");
  return { exitCode: 1, output, durationMs };
}
